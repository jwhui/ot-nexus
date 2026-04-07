fn main() {
    tonic_build::configure()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .compile(&["../../openthread/tests/nexus/platform/simulation.proto"], &["../../openthread/tests/nexus/platform"])
        .unwrap();
    tauri_build::build()
}
