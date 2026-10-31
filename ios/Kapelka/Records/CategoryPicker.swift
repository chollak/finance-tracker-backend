import Foundation
import Observation

/// What the sheet of categories offers (FT-221).
struct CategoryChoices: Equatable, Sendable {
    /// The visible categories of the record's type, in the server's order.
    let visible: [RecordCategory]
    /// The record's own category when it is hidden: shown apart with its checkmark, so the sheet never lacks one.
    let hiddenCurrent: RecordCategory?
}

/// The sheet a tap on a row of «Записи» opens (FT-221): the visible categories of the record's type, the current one
/// checked. A choice saves at once; the sheet closes when the server took it — this sheet only, not one opened since
/// for another row. The correction teaches the server (FT-184: an Apple Pay payment teaches its merchant whole, a
/// phrase its words). Amount, account and date stay in the Mini App (decision 2026-10-31).
@MainActor
@Observable
final class CategoryPicker: Identifiable {
    enum Choices: Equatable {
        case loading
        case loaded(CategoryChoices)
        /// What to say; «Повторить» loads again.
        case failed(String)
    }

    /// The record's id: one sheet per row.
    let id: String
    let kind: Record.Kind
    /// The checked one; `nil` on a record from before FT-099.
    let currentId: String?
    private(set) var choices: Choices = .loading
    /// The category being saved: the sheet waits for the server.
    private(set) var savingId: String?
    /// Why the last choice did not save; the sheet stays open.
    private(set) var problem: String?

    private let list: RecordsList

    init(record: Record, list: RecordsList) {
        id = record.id
        kind = record.type
        currentId = record.categoryId
        self.list = list
    }

    /// Without a network the sheet says so — after why the last choice did not save, if it did not.
    func load() async {
        do {
            choices = .loaded(Self.choices(try await list.categories(), for: kind, current: currentId))
        } catch {
            choices = .failed([problem, error.message].compactMap { $0 }.joined(separator: ". "))
        }
    }

    /// `true` when the sheet closes: the server saved it, it is the current one already, or the record is gone — then
    /// the list says so itself. Without a network nothing changes, and the sheet says why.
    func choose(_ categoryId: String) async -> Bool {
        guard savingId == nil else { return false }
        guard categoryId != currentId else {
            close()
            return true
        }
        savingId = categoryId
        problem = nil
        defer { savingId = nil }
        do {
            try await list.setCategory(categoryId, of: id)
            close()
            return true
        } catch {
            switch error {
            case .recordGone:
                close()
                return true
            case .categoryGone:
                // Deleted in the Mini App meanwhile: the record keeps its category, the list is new
                problem = error.message
                await load()
                return false
            default:
                problem = error.message
                return false
            }
        }
    }

    /// «Закрыть», or the server took the choice.
    func close() {
        list.closePicker(id)
    }

    /// The record's type only — a type change is the Mini App's — without the hidden ones, in the server's order; the
    /// record's own hidden category apart.
    static func choices(_ categories: [RecordCategory], for kind: Record.Kind, current: String?) -> CategoryChoices {
        let ofKind = categories.filter { $0.type == kind }
        return CategoryChoices(
            visible: ofKind.filter { !$0.isHidden },
            hiddenCurrent: ofKind.first { $0.isHidden && $0.id == current }
        )
    }
}
