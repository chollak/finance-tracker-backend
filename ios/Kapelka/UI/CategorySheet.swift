import SwiftUI

/// The categories of a record (FT-221), standard components only: a `List` in a `NavigationStack`, the current one
/// with a checkmark. A tap saves at once and closes the sheet once the server took it — this sheet only: not
/// `dismiss`, which a slow answer would apply to a sheet opened since for another row. A record with «!» (FT-254)
/// says why over the categories, with «Да, верно».
struct CategorySheet: View {
    let picker: CategoryPicker

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Категория")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Закрыть", action: picker.close)
                    }
                }
        }
        // At the accessibility sizes half a screen holds the reason alone (review of PR #170)
        .presentationDetents(CategorySheetLayout.detents(at: typeSize))
        .task { await picker.load() }
    }

    @ViewBuilder
    private var content: some View {
        if picker.needsReview {
            // One list: the reason stays on screen whatever the categories do
            List {
                ReviewSection(picker: picker)
                categoriesSection
            }
        } else {
            categoriesAlone
        }
    }

    /// Without «!», as in FT-221: the empty states fill the sheet.
    @ViewBuilder
    private var categoriesAlone: some View {
        switch picker.choices {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(message):
            ContentUnavailableView {
                Label("Категории не загрузились", systemImage: "wifi.slash")
            } description: {
                Text(message)
            } actions: {
                retryButton
            }
        case let .loaded(choices):
            List {
                loaded(choices)
            }
        }
    }

    /// Under the reason of «!»: the same states as rows of the list.
    @ViewBuilder
    private var categoriesSection: some View {
        switch picker.choices {
        case .loading:
            Section("Категория") {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }
        case let .failed(message):
            Section("Категории не загрузились") {
                Text(message)
                    .foregroundStyle(.secondary)
                retryButton
            }
        case let .loaded(choices):
            loaded(choices)
        }
    }

    private var retryButton: some View {
        Button("Повторить") {
            Task { await picker.load() }
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder
    private func loaded(_ choices: CategoryChoices) -> some View {
        if let problem = picker.problem {
            Section {
                Text(problem)
                    .foregroundStyle(.secondary)
            }
        }
        if let hidden = choices.hiddenCurrent {
            Section {
                row(hidden)
            } footer: {
                Text("Категория скрыта в Mini App — её нет среди остальных")
            }
        }
        // Under the reason of «!» the categories need a name; alone they are the whole sheet
        if picker.needsReview {
            Section("Категория") {
                rows(choices.visible)
            }
        } else {
            Section {
                rows(choices.visible)
            }
        }
    }

    private func rows(_ categories: [RecordCategory]) -> some View {
        ForEach(categories) { category in
            row(category)
        }
    }

    private func row(_ category: RecordCategory) -> some View {
        let isCurrent = category.id == picker.currentId
        return Button {
            // Not tied to the sheet: closing it must not cancel the save; the picker closes its own sheet
            Task { _ = await picker.choose(category.id) }
        } label: {
            HStack {
                Text(category.name)
                    .foregroundStyle(.primary)
                Spacer()
                if picker.savingId == category.id {
                    ProgressView()
                } else if isCurrent {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                }
            }
        }
        .disabled(picker.isBusy)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }
}

/// «!» of a record (FT-254): the general phrase first, then «Что я предположил» — what the server took for granted, when
/// the phone knows it — and «Да, верно», which takes «!» off. A category below does not — the reason stays until
/// «Да, верно» (decision 2026-10-31).
private struct ReviewSection: View {
    let picker: CategoryPicker

    var body: some View {
        Section {
            Text(RecordReview.unsureText)
            if let assumed = picker.review?.assumed, !assumed.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(RecordReview.assumedTitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ForEach(assumed, id: \.self) { line in
                        Text(line)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if let problem = picker.reviewProblem {
                Text(problem)
                    .foregroundStyle(.secondary)
            }
            Button {
                // Not tied to the sheet, as a category: the picker closes its own sheet
                Task { _ = await picker.confirm() }
            } label: {
                HStack {
                    Label("Да, верно", systemImage: "checkmark.circle")
                    if picker.isConfirming {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(picker.isBusy)
        } header: {
            Label("Проверить", systemImage: "exclamationmark.circle")
                .foregroundStyle(.orange)
        } footer: {
            Text(RecordReview.editedElsewhere)
        }
    }
}

/// How tall the sheet of categories opens.
enum CategorySheetLayout {
    static func detents(at size: DynamicTypeSize) -> Set<PresentationDetent> {
        size.isAccessibilitySize ? [.large] : [.medium, .large]
    }
}
