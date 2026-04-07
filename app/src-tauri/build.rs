fn main() {
    tonic_build::configure()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .compile(&["../../proto/simulation.proto"], &["../../proto"])
        .unwrap();
    tauri_build::build()
}
