use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_player_and_ranks_it() {
        let state = AppState::new();
        let player = state.create_player("alice".to_string());

        assert_eq!(player.username, "alice");
        assert_eq!(state.leaderboard().len(), 1);
    }
}

#[derive(Clone, Debug)]
struct AppState {
    players: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Player>>>,
    queue: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    matches: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Match>>>,
    next_player_id: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

impl AppState {
    fn new() -> Self {
        Self {
            players: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            queue: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
            matches: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            next_player_id: std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(1)),
        }
    }

    fn create_player(&self, username: String) -> Player {
        let id = self.next_player_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let player = Player {
            id: format!("player-{id}"),
            username,
            score: 0,
            wins: 0,
            losses: 0,
        };

        self.players.lock().unwrap().insert(player.id.clone(), player.clone());
        player
    }

    fn leaderboard(&self) -> Vec<Player> {
        let players = self.players.lock().unwrap();
        let mut values: Vec<Player> = players.values().cloned().collect();
        values.sort_by(|a, b| b.score.cmp(&a.score));
        values
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct Player {
    id: String,
    username: String,
    score: i32,
    wins: i32,
    losses: i32,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct Match {
    id: String,
    player_one: String,
    player_two: String,
    score_one: i32,
    score_two: i32,
    status: String,
}

#[derive(serde::Serialize)]
struct LeaderboardEntry {
    rank: usize,
    player: Player,
}

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

#[post("/players")]
async fn create_player(state: web::Data<AppState>, data: web::Json<String>) -> impl Responder {
    let username = data.trim();
    if username.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Username is required" }));
    }

    let player = state.create_player(username.to_string());
    HttpResponse::Ok().json(player)
}

#[get("/leaderboard")]
async fn leaderboard(state: web::Data<AppState>) -> impl Responder {
    let list = state.leaderboard();
    let ranked: Vec<LeaderboardEntry> = list
        .into_iter()
        .enumerate()
        .map(|(index, player)| LeaderboardEntry {
            rank: index + 1,
            player,
        })
        .collect();

    HttpResponse::Ok().json(ranked)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let state = AppState::new();
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .service(health)
            .service(create_player)
            .service(leaderboard)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
