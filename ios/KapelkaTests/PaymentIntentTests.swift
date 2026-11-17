import Foundation
import Testing
@testable import Kapelka

/// The fields of «Записать оплату» as the payment gets them (#398): the number and «Код валюты» Wallet gives without
/// text, the old text field for an automation not set up again yet.
@Suite("Поля команды «Записать оплату»")
struct PaymentIntentTests {
    @Test("сумма числом и «Код валюты» — в оплату как есть")
    func numberAndCode() {
        let intent = RecordPaymentIntent()
        intent.amountNumber = 28_000
        intent.amountCurrency = "UZS"
        intent.merchant = "Ooo Mazzali Super Food"
        intent.card = "TBC Uzbekistan"

        #expect(intent.input == PaymentInput(
            amountNumber: 28_000,
            amountCurrency: "UZS",
            merchant: "Ooo Mazzali Super Food",
            card: "TBC Uzbekistan"
        ))
    }

    @Test("старое поле «Сумма текстом» и «Валюта» автоматизации — как раньше")
    func oldTextField() {
        let intent = RecordPaymentIntent()
        intent.amount = "28\u{00A0}000,00\u{00A0}UZS"
        intent.currency = .uzs
        intent.merchant = "Shop"

        #expect(intent.input == PaymentInput(amount: "28\u{00A0}000,00\u{00A0}UZS", currency: .uzs, merchant: "Shop"))
    }
}
