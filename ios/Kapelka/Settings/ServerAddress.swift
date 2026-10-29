import Foundation

enum SettingsError: Error, Equatable {
    case badAddress
    case badToken
    /// No token in the field and none saved before.
    case noToken
    case keychain(OSStatus)
}

/// The PC's address in the tailnet, as typed or pasted: `https://<pc>.<tailnet>.ts.net`.
enum ServerAddress {
    /// Scheme, host and port only. No scheme means https; a pasted Mini App link loses its path — the API is always
    /// at `/api` from the root.
    static func normalized(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard
            let parsed = URLComponents(string: text),
            let scheme = parsed.scheme?.lowercased(), ["https", "http"].contains(scheme),
            let host = parsed.host, isHostName(host)
        else { return nil }

        var components = URLComponents()
        components.scheme = scheme
        components.host = host.lowercased()
        components.port = parsed.port
        return components.url
    }

    private static func isHostName(_ host: String) -> Bool {
        !host.isEmpty && host.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == ".")
        }
    }
}

/// `SHORTCUT_CAPTURE_TOKEN` as typed: it goes into an HTTP header, so visible ASCII only.
enum CaptureToken {
    static func validated(_ raw: String) throws(SettingsError) -> String {
        let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let isHeaderSafe = token.unicodeScalars.allSatisfy { (0x21...0x7E).contains($0.value) }
        guard !token.isEmpty, isHeaderSafe else { throw .badToken }
        return token
    }
}
