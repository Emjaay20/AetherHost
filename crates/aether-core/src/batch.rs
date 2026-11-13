use crate::error::PlatformError;
use std::{
    future::Future,
    sync::Arc,
    time::Duration,
};
use tokio::{
    sync::mpsc::{self, Receiver, Sender},
    sync::oneshot,
    task::JoinHandle,
    time::interval,
};

/// High-throughput asynchronous batch ingestor designed for Kafka event streaming
/// and ClickHouse columnar batch writing.
///
/// Features:
/// - Micro-batching by capacity threshold or flush interval.
/// - Concurrency-safe bounded channels for strict backpressure.
/// - Non-blocking and async enqueueing.
/// - Graceful shutdown with full buffer draining.
pub struct BatchIngestor<T: Send + 'static> {
    sender: Sender<T>,
    drain_sender: Option<oneshot::Sender<()>>,
    worker_handle: Option<JoinHandle<()>>,
}

impl<T: Send + 'static> BatchIngestor<T> {
    pub fn new<F, Fut>(
        max_batch_size: usize,
        flush_interval: Duration,
        channel_capacity: usize,
        flush_fn: F,
    ) -> Self
    where
        F: Fn(Vec<T>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let (tx, rx) = mpsc::channel(channel_capacity);
        let (drain_tx, drain_rx) = oneshot::channel();
        let flush_fn = Arc::new(flush_fn);

        let worker_handle = tokio::spawn(Self::run_worker(
            rx,
            drain_rx,
            max_batch_size,
            flush_interval,
            flush_fn,
        ));

        Self {
            sender: tx,
            drain_sender: Some(drain_tx),
            worker_handle: Some(worker_handle),
        }
    }

    /// Asynchronously pushes an item into the buffer.
    /// Awaits if the bounded channel is full (applying backpressure).
    pub async fn push(&self, item: T) -> Result<(), PlatformError> {
        self.sender
            .send(item)
            .await
            .map_err(|_| PlatformError::Internal("Batch ingestor worker channel closed".to_string()))
    }

    /// Attempts to push an item without awaiting. Returns RateLimitExceeded if channel is full.
    pub fn try_push(&self, item: T) -> Result<(), PlatformError> {
        self.sender.try_send(item).map_err(|e| match e {
            mpsc::error::TrySendError::Full(_) => PlatformError::RateLimitExceeded {
                limit: self.sender.max_capacity() as u32,
                reset_epoch_secs: 0,
            },
            mpsc::error::TrySendError::Closed(_) => {
                PlatformError::Internal("Batch ingestor channel closed".to_string())
            }
        })
    }

    /// Initiates graceful shutdown and awaits completion of remaining buffer draining.
    pub async fn shutdown(mut self) {
        if let Some(drain_tx) = self.drain_sender.take() {
            let _ = drain_tx.send(());
        }
        if let Some(handle) = self.worker_handle.take() {
            let _ = handle.await;
        }
    }

    async fn run_worker<F, Fut>(
        mut rx: Receiver<T>,
        mut drain_rx: oneshot::Receiver<()>,
        max_batch_size: usize,
        flush_interval: Duration,
        flush_fn: Arc<F>,
    ) where
        F: Fn(Vec<T>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let mut timer = interval(flush_interval);
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut current_batch = Vec::with_capacity(max_batch_size);

        loop {
            tokio::select! {
                _ = &mut drain_rx => {
                    // Drain all remaining items in channel
                    while let Ok(item) = rx.try_recv() {
                        current_batch.push(item);
                        if current_batch.len() >= max_batch_size {
                            let batch = std::mem::replace(&mut current_batch, Vec::with_capacity(max_batch_size));
                            flush_fn(batch).await;
                        }
                    }
                    if !current_batch.is_empty() {
                        let batch = std::mem::take(&mut current_batch);
                        flush_fn(batch).await;
                    }
                    break;
                }
                _ = timer.tick() => {
                    if !current_batch.is_empty() {
                        let batch = std::mem::replace(&mut current_batch, Vec::with_capacity(max_batch_size));
                        flush_fn(batch).await;
                    }
                }
                item_opt = rx.recv() => {
                    match item_opt {
                        Some(item) => {
                            current_batch.push(item);
                            if current_batch.len() >= max_batch_size {
                                let batch = std::mem::replace(&mut current_batch, Vec::with_capacity(max_batch_size));
                                flush_fn(batch).await;
                            }
                        }
                        None => {
                            // Sender dropped, flush and terminate
                            if !current_batch.is_empty() {
                                let batch = std::mem::take(&mut current_batch);
                                flush_fn(batch).await;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}
