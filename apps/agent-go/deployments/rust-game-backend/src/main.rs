use tiny_http::{Server, Response};
use rusqlite::Connection;

fn main() {
    let _conn = Connection::open_in_memory().unwrap();
    let server = Server::http("0.0.0.0:8080").unwrap();
    for _ in server.incoming_requests() {
        let mut resp = Response::from_string("Hello, world!");
        resp.add_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/plain"[..]).unwrap());
        server.respond(resp).unwrap();
    }
}
