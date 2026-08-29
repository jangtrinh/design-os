import SwiftUI

struct DictionaryResultRow: View {
    let entry: DictionaryEntry

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.term)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(entry.pronunciation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(entry.definition)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.body.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
    }
}
