import Foundation
import Network

/// The network path: `true` when there is a connection.
protocol PathWatching: Sendable {
    func start(onChange: @escaping @Sendable (Bool) -> Void)
}

final class NetworkPathWatcher: PathWatching, @unchecked Sendable {
    // NWPathMonitor is used only through its own queue
    private let monitor = NWPathMonitor()
    private let callbacks = DispatchQueue(label: "kapelka.network-path")

    func start(onChange: @escaping @Sendable (Bool) -> Void) {
        monitor.pathUpdateHandler = { path in onChange(path.status == .satisfied) }
        monitor.start(queue: callbacks)
    }
}

/// Sends the queue each time a connection appears while the app runs — Wi-Fi, mobile data, or Tailscale switching
/// on, which iOS reports as a new path. There is no signal for «the PC woke up», so every new path is one more try;
/// with nothing pending it costs no request.
struct AutoSender: Sendable {
    let watcher: any PathWatching
    let queue: CaptureQueue

    func start() {
        watcher.start { [queue] satisfied in
            guard satisfied else { return }
            Task { await queue.flush() }
        }
    }
}
