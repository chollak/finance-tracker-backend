import Darwin
import Foundation

/// When the kernel started this process: one `sysctl` of the process itself, nothing done at launch for it. The start of
/// a command measured from it tells a slow cold launch from a slow command (#241).
enum ProcessStart {
    static func date() -> Date? {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var name: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&name, u_int(name.count), &info, &size, nil, 0) == 0, size > 0 else { return nil }
        let start = info.kp_proc.p_un.__p_starttime
        guard start.tv_sec > 0 else { return nil }
        return Date(timeIntervalSince1970: TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000)
    }
}

/// The build a journal came from, at the top of what «Поделиться» sends: the app is re-signed and rebuilt every week,
/// and its version number stays the same — the moment it was built tells one build from another.
struct AppBuild: Equatable, Sendable {
    let version: String
    let build: String
    let system: String
    /// When the app's executable was written; `nil` when the file says nothing.
    let builtAt: Date?

    static func current() -> AppBuild {
        let info = Bundle.main.infoDictionary ?? [:]
        let os = ProcessInfo.processInfo.operatingSystemVersion
        let patch = os.patchVersion > 0 ? ".\(os.patchVersion)" : ""
        let executable = Bundle.main.executableURL?.path(percentEncoded: false)
        let attributes = executable.flatMap { try? FileManager.default.attributesOfItem(atPath: $0) }
        return AppBuild(
            version: info["CFBundleShortVersionString"] as? String ?? "?",
            build: info["CFBundleVersion"] as? String ?? "?",
            system: "iOS \(os.majorVersion).\(os.minorVersion)\(patch)",
            builtAt: attributes?[.modificationDate] as? Date
        )
    }
}
