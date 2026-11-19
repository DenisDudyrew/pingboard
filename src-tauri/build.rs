use std::{env,process::Command};
fn main() {
    let out=env::var("OUT_DIR").unwrap();
    let status=Command::new("xcrun").args(["swiftc","-parse-as-library","-emit-library","-static","Reminder.swift","-o",&format!("{out}/libreminder.a")]).status().expect("Swift compiler required");
    assert!(status.success());
    println!("cargo:rerun-if-changed=Reminder.swift");
    println!("cargo:rustc-link-search=native={out}");
    println!("cargo:rustc-link-lib=static=reminder");
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-lib=framework=UserNotifications");
    tauri_build::build()
}
