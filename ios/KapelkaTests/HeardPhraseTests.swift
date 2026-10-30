import Testing
@testable import Kapelka

/// Apple's recognizer on the phone starts a new segment after a pause: an empty result, then only the new words.
@Suite("Фраза из кусков распознавания")
struct HeardPhraseTests {
    private func heard(_ results: [String]) -> HeardPhrase {
        var phrase = HeardPhrase()
        for result in results {
            phrase.hear(result)
        }
        return phrase
    }

    @Test("куски одного отрезка — фраза равна последнему")
    func oneSegment() {
        #expect(heard(["кофе", "кофе 25", "кофе 25 тысяч"]).text == "кофе 25 тысяч")
    }

    @Test("пустой результат после паузы фразу не стирает")
    func emptyKeepsPhrase() {
        #expect(heard(["кофе 25 тысяч", ""]).text == "кофе 25 тысяч")
        #expect(heard(["кофе 25 тысяч", "  "]).text == "кофе 25 тысяч")
    }

    @Test("после паузы новые слова дописываются к услышанному")
    func newSegmentAppends() {
        #expect(heard(["кофе 25 тысяч", "", "и", "и такси 18"]).text == "кофе 25 тысяч и такси 18")
    }

    @Test("закрытый отрезок, присланный ещё раз в конце, не дублируется")
    func repeatedSegmentIgnored() {
        #expect(heard(["кофе 25 тысяч", "", "кофе 25 тысяч"]).text == "кофе 25 тысяч")
    }

    @Test("фраза изменилась — да; тот же текст или пустой — нет: пауза от них не продлевается")
    func reportsChange() {
        var phrase = HeardPhrase()
        let changes = ["кофе", "кофе", "", "кофе 25"].map { phrase.hear($0) }
        #expect(changes == [true, false, false, true])
    }

    @Test("ничего не сказано — фраза пустая")
    func nothing() {
        #expect(heard(["", ""]).text.isEmpty)
    }
}
