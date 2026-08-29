import SwiftUI

struct DictionarySearchHeader: View {
    @Binding var query: String
    var focus: FocusState<Bool>.Binding
    var accessibilityFocus: AccessibilityFocusState<Bool>.Binding
    let onSubmit: () -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("A calm reference, right where you are reading.")
                .font(.title2.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    searchField
                    submitButton
                }

                VStack(alignment: .leading, spacing: 12) {
                    searchField
                    submitButton
                }
            }
        }
        .padding(16)
        .background(cardBackground)
        .accessibilityElement(children: .contain)
    }

    private var searchField: some View {
        TextField("Vietnamese or English word", text: $query)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .focused(focus)
            .accessibilityFocused(accessibilityFocus)
            .accessibilityLabel("Dictionary search")
            .accessibilityHint("Enter a Vietnamese or English word, then activate Search.")
            .accessibilityIdentifier("dictionary-search-field")
            .onSubmit(onSubmit)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var submitButton: some View {
        Button(action: onSubmit) {
            Label("Search", systemImage: "magnifyingglass")
                .frame(minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .accessibilityHint("Shows matching local dictionary entries.")
        .accessibilityIdentifier("dictionary-search-submit")
    }

    @ViewBuilder
    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(reduceTransparency ? AnyShapeStyle(Color.secondary.opacity(0.14)) : AnyShapeStyle(.thinMaterial))
    }
}
