import Foundation
import Testing
@testable import Kapelka

/// Amounts as the Mini App shows them (`formatMinor` in `webapp/src/shared/lib/money`, `docs/pastel/money-model.md`),
/// with «$» for dollars (FT-219).
@Suite("Суммы записей")
struct MoneyTextTests {
    private let nbsp = "\u{00A0}"
    private let minus = "\u{2212}"

    @Test("расход в сумах — «−25 000 сум», доход в долларах — «+1 200,50 $»")
    func recordAmounts() throws {
        let expense = try record(RecordsReply.record(type: "expense", amountMinor: 2_500_000, currency: "UZS"))
        let income = try record(RecordsReply.record(type: "income", amountMinor: 120_050, currency: "USD"))

        #expect(MoneyText.signed(expense) == "\(minus)25\(nbsp)000\(nbsp)сум")
        #expect(MoneyText.signed(income) == "+1\(nbsp)200,50\(nbsp)$")
    }

    @Test("сумы без дробей, с округлением как в Mini App; доллары всегда с центами")
    func fractions() {
        #expect(MoneyText.format(minor: 2_500_050, currency: "UZS") == "25\(nbsp)001\(nbsp)сум")
        #expect(MoneyText.format(minor: 2_500_049, currency: "UZS") == "25\(nbsp)000\(nbsp)сум")
        #expect(MoneyText.format(minor: 450, currency: "USD") == "4,50\(nbsp)$")
        #expect(MoneyText.format(minor: 5, currency: "USD") == "0,05\(nbsp)$")
    }

    @Test("разряды по три неразрывным пробелом; знак — настоящий минус или «+»")
    func groupsAndSign() {
        #expect(MoneyText.format(minor: 100_000_000_000, currency: "UZS", sign: .always)
            == "+1\(nbsp)000\(nbsp)000\(nbsp)000\(nbsp)сум")
        #expect(MoneyText.format(minor: -1_864_000_000, currency: "UZS") == "\(minus)18\(nbsp)640\(nbsp)000\(nbsp)сум")
        #expect(MoneyText.format(minor: 99_900, currency: "UZS") == "999\(nbsp)сум")
        #expect(MoneyText.format(minor: 0, currency: "UZS", sign: .always) == "0\(nbsp)сум")
    }

    @Test("у записи без валюты — сумы: так пишет сервер для старых записей")
    func missingCurrencyIsSum() throws {
        let json = RecordsReply.record(amountMinor: 1_800_000).replacingOccurrences(of: #""currency":"UZS","#, with: "")
        #expect(MoneyText.signed(try record(json)) == "\(minus)18\(nbsp)000\(nbsp)сум")
    }

    @Test("незнакомая валюта — её код и центы, а не «сум»")
    func unknownCurrency() {
        #expect(MoneyText.format(minor: 1_000, currency: "EUR") == "10,00\(nbsp)EUR")
    }

    private func record(_ json: String) throws -> Record {
        try JSONDecoder().decode(Record.self, from: Data(json.utf8))
    }
}
