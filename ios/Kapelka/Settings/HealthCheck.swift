import Foundation

/// What «Проверить связь» found (#283).
enum ConnectionReport: Equatable, Sendable {
    /// Not an address the token may go to (`ServerAddress`, as «Сохранить»): nothing was sent.
    case badAddress
    /// `/api/health` got no answer to go by, for the queue's reasons (`QueueWait`).
    case noAnswer(QueueWait)
    /// Someone answered `/api/health`, but not Kapelka: another server, a proxy, a Wi-Fi login page. The token is not
    /// sent to it.
    case notKapelka
    /// Kapelka answered. `botWorks` is false for its 503 (FT-154): the bot does not poll Telegram, and recording from
    /// the phone does not need it.
    case kapelka(botWorks: Bool, token: TokenCheck)
}

enum TokenCheck: Equatable, Sendable {
    /// `GET /api/categories` answered with the records' envelope: the token signs the owner in (FT-218).
    case accepted
    /// 401, 403 — as the queue's «проверь токен».
    case refused
    /// No answer to go by: no network, a timeout, 429, 5xx, a body that is not Kapelka's.
    case unknown
    /// None in the field and none saved: nothing to check.
    case missing
    /// The field's token cannot go into a header (`CaptureToken`), so «Сохранить» refuses it too.
    case malformed
}

/// «Проверить связь» with the fields as typed, before «Сохранить». First `GET /api/health` without the token: is it
/// Kapelka (`status` and `telegramBot.state` in the body, `healthRoutes.ts`) and does its bot work. Only then
/// `GET /api/categories` — a route the app token opens (FT-218) — with the field's token, or the saved one when the
/// field is empty, as «Сохранить» keeps it. Two reads and nothing else: the check gets only the transport, so it saves
/// nothing and touches neither the queue nor the cache of «Записи».
struct HealthCheck: Sendable {
    static let timeout: TimeInterval = 10

    let transport: any HTTPTransport

    func run(address: String, typedToken: String, savedToken: String?) async -> ConnectionReport {
        guard let base = ServerAddress.normalized(address) else { return .badAddress }
        switch await health(at: base) {
        case let .noAnswer(wait):
            return .noAnswer(wait)
        case .notKapelka:
            return .notKapelka
        case let .kapelka(botWorks):
            return .kapelka(botWorks: botWorks, token: await token(typed: typedToken, saved: savedToken, at: base))
        }
    }

    /// What `/api/health` says by its body first: Kapelka's 503 is an answer, a proxy's 200 is not.
    private static func healthAnswer(status: Int, body: Data) -> HealthAnswer {
        if let health = try? JSONDecoder().decode(HealthBody.self, from: body), health.isKapelka {
            return .kapelka(botWorks: health.status == HealthBody.healthy)
        }
        switch status {
        case 429: return .noAnswer(.busy)
        // A gateway with Kapelka down behind it (`tailscale serve` answers 502), or the server failed
        case 408, 500...: return .noAnswer(.noAnswer)
        // A 3xx (redirects are refused, `RefuseRedirects`), a 404, a 200 of another server
        default: return .notKapelka
        }
    }

    private static func tokenCheck(status: Int, body: Data) -> TokenCheck {
        switch status {
        case 200..<300:
            let answer = try? JSONDecoder().decode(Envelope.self, from: body)
            return answer?.success == true ? .accepted : .unknown
        case 401, 403:
            return .refused
        default:
            return .unknown
        }
    }

    private func health(at base: URL) async -> HealthAnswer {
        do {
            let (data, response) = try await transport.data(for: Self.request(base, path: "api/health"))
            guard let http = response as? HTTPURLResponse else { return .noAnswer(.noAnswer) }
            return Self.healthAnswer(status: http.statusCode, body: data)
        } catch {
            return .noAnswer(QueueWait.of(error))
        }
    }

    /// An empty field means the saved token, as «Сохранить» keeps it; a typed one is checked as «Сохранить» checks it.
    private func token(typed: String, saved: String?, at base: URL) async -> TokenCheck {
        let token: String
        if typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard let saved else { return .missing }
            token = saved
        } else {
            guard let valid = try? CaptureToken.validated(typed) else { return .malformed }
            token = valid
        }
        var request = Self.request(base, path: "api/categories")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(token, forHTTPHeaderField: "X-Shortcut-Capture-Token")
        do {
            let (data, response) = try await transport.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .unknown }
            return Self.tokenCheck(status: http.statusCode, body: data)
        } catch {
            return .unknown
        }
    }

    private static func request(_ base: URL, path: String) -> URLRequest {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        return request
    }
}

private enum HealthAnswer {
    case noAnswer(QueueWait)
    case notKapelka
    case kapelka(botWorks: Bool)
}

/// The body of `GET /api/health`; both fields are pinned by `tests/healthRoute.test.ts`.
private struct HealthBody: Decodable {
    static let healthy = "healthy"

    struct Bot: Decodable {
        let state: String
    }

    let status: String
    let telegramBot: Bot

    var isKapelka: Bool {
        [Self.healthy, "unhealthy"].contains(status)
    }
}

private struct Envelope: Decodable {
    let success: Bool
}

extension ConnectionReport {
    /// What the settings show under «Проверить связь», in the words of the card on «Записать» (`LastPhrase`) and of
    /// «Сохранить» (`SettingsMessage`).
    var text: String {
        switch self {
        case .badAddress: SettingsMessage.badAddress
        case .noAnswer(.offline): "Нет связи — проверь сеть, Tailscale и адрес"
        case .noAnswer(.noAnswer): "Сервер не ответил — ПК спит или Kapelka не запущена"
        case .noAnswer(.busy): "Сервер просит подождать — попробуй позже"
        case .notKapelka: "По этому адресу отвечает не Kapelka — проверь адрес"
        case let .kapelka(botWorks, token): botWorks ? token.text : "\(token.text). \(Self.botFailed(token))"
        }
    }

    /// Recording from the phone works without the bot, but only with a token the server took.
    private static func botFailed(_ token: TokenCheck) -> String {
        token == .accepted ? "Бот Telegram не работает — запись с iPhone работает" : "Бот Telegram не работает"
    }
}

private extension TokenCheck {
    var text: String {
        switch self {
        case .accepted: "Сервер доступен, токен принят"
        case .refused: "Сервер не принял токен"
        case .unknown: "Сервер доступен, токен не проверен — попробуй позже"
        case .missing: "Сервер доступен — вставь токен"
        case .malformed: "Сервер доступен. \(SettingsMessage.text(for: .badToken))"
        }
    }
}
