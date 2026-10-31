import Foundation

extension QueueState {
    /// The queue's answer for a record of «Записи» written from this phone (FT-255): the record's `clientId` names the
    /// phrase or payment, its `id` the record among those the server wrote for it — not the number after «:», which
    /// counts the parse's items, not the records written. `nil` for a record written elsewhere, sent by a build before
    /// FT-255, or whose phrase is no longer among the 50 kept.
    func answer(for record: Record) -> CapturedRecord? {
        guard let clientId = record.captureClientId else { return nil }
        return captures.first { $0.clientId == clientId }?.reply?.records.first { $0.id == record.id }
    }
}
