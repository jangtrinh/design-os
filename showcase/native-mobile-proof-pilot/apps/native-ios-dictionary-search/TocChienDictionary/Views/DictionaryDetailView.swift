import SwiftUI

struct DictionaryDetailView: View {
    let entry: DictionaryEntry

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(entry.term)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text(entry.pronunciation)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Pronunciation, \(entry.pronunciation)")
                }

                detailCard(title: "Definition", text: entry.definition)
                detailCard(title: "Example", text: entry.example)
            }
            .frame(maxWidth: 700, alignment: .leading)
            .padding()
        }
        .navigationTitle(entry.term)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detailCard(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(text)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(reduceTransparency ? AnyShapeStyle(Color.secondary.opacity(0.14)) : AnyShapeStyle(.thinMaterial))
        }
    }
}
