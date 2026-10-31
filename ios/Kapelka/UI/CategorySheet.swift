import SwiftUI

/// The categories of a record (FT-221), standard components only: a `List` in a `NavigationStack`, the current one
/// with a checkmark. A tap saves at once and closes the sheet once the server took it.
struct CategorySheet: View {
    let picker: CategoryPicker

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Категория")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Закрыть") { dismiss() }
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .task { await picker.load() }
    }

    @ViewBuilder
    private var content: some View {
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
                Button("Повторить") {
                    Task { await picker.load() }
                }
                .buttonStyle(.bordered)
            }
        case let .loaded(categories):
            List {
                if let problem = picker.problem {
                    Section {
                        Text(problem)
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    ForEach(categories) { category in
                        row(category)
                    }
                }
            }
        }
    }

    private func row(_ category: RecordCategory) -> some View {
        let isCurrent = category.id == picker.currentId
        return Button {
            // Not tied to the sheet: closing it must not cancel the save
            Task {
                if await picker.choose(category.id) {
                    dismiss()
                }
            }
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
        .disabled(picker.savingId != nil)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }
}
