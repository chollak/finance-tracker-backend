import SwiftUI

/// The entry point. Under `xcodebuild test` the app only hosts the tests: no queue, no network watcher, nothing sent —
/// a simulator with a saved address would otherwise send its own queue while the tests run.
@main
enum KapelkaMain {
    static func main() {
        if TestRun.isActive {
            TestHostApp.main()
        } else {
            KapelkaApp.main()
        }
    }
}

enum TestRun {
    /// Xcode sets it for the app that hosts a test bundle.
    static var isActive: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}

private struct TestHostApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Тесты Kapelka")
        }
    }
}
