import Foundation

extension RecordsFailure {
    /// The symbol next to the reason in «Записи» and the sheet of categories (#282): the one the card on «Записать»
    /// draws for the same reason (`LastPhraseView`), so «wifi.slash» means no network on both tabs.
    var systemImage: String {
        switch self {
        case .notConfigured: "gearshape"
        case .tokenRefused: "key"
        case .later(.offline): "wifi.slash"
        case .later(.noAnswer): "clock"
        case .later(.busy): "hourglass"
        case .refused: "xmark.circle"
        case .recordGone: "trash"
        case .categoryGone: "questionmark.circle"
        }
    }
}
