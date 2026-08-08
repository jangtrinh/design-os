---
id: ux-psychology
description: "UX laws, Gestalt perception, cognitive biases, trust, and cognitive-load management."
when: [ux-law, psychology, hicks-law, fitts-law, gestalt, cognitive-load, persuasion]
---

# UX Psychology Reference

> Deep dive into UX laws, emotional design, trust building, and behavioral psychology.

---

## 1. Core UX Laws

### Hick's Law

**Principle:** The time to make a decision increases logarithmically with the number of choices.

```
Decision Time = a + b × log₂(n + 1)
Where n = number of choices
```

**Application:**
- Navigation: Max 5-7 top-level items
- Forms: Break into steps (progressive disclosure)
- Options: Default selections when possible
- Filters: Prioritize most-used, hide advanced

**Example:**
```
❌ Bad: 15 menu items in one nav
✅ Good: 5 main categories + "More" 

❌ Bad: 20 form fields at once
✅ Good: 3-step wizard with 5-7 fields each
```

---

### Fitts' Law

**Principle:** Time to reach a target = function of distance and size.

```
MT = a + b × log₂(1 + D/W)
Where D = distance, W = width
```

**Application:**
- CTAs: Make primary buttons larger (min 44px height)
- Touch targets: 44×44px minimum on mobile
- Placement: Important actions near natural cursor position
- Corners: "Magic corners" (infinite edge = easy to hit)

**Button Sizing:**
```css
/* Size by importance */
.btn-primary { height: 48px; padding: 0 24px; }
.btn-secondary { height: 40px; padding: 0 16px; }
.btn-tertiary { height: 36px; padding: 0 12px; }

/* Mobile touch targets */
@media (hover: none) {
  .btn { min-height: 44px; min-width: 44px; }
}
```

---

### Miller's Law

**Principle:** Average person can hold 7±2 chunks in working memory.

**Application:**
- Lists: Group into chunks of 5-7 items
- Navigation: Max 7 menu items
- Content: Break long content with headings
- Phone numbers: 555-123-4567 (chunked)

**Chunking Example:**
```
❌ 5551234567
✅ 555-123-4567

❌ Long paragraph of text without breaks
✅ Short paragraphs
   With bullet points
   And subheadings
```

---

### Von Restorff Effect (Isolation Effect)

**Principle:** An item that stands out is more likely to be remembered.

**Application:**
- CTA buttons: Distinct color from other elements
- Pricing: Highlight recommended plan
- Important info: Visual differentiation
- New features: Badge or callout

**Example:**
```css
/* All buttons gray, primary stands out */
.btn { background: #E5E7EB; }
.btn-primary { background: #3B82F6; }

/* Recommended plan highlighted */
.pricing-card { border: 1px solid #E5E7EB; }
.pricing-card.popular { 
  border: 2px solid #3B82F6;
  box-shadow: var(--shadow-lg);
}
```

---

### Serial Position Effect

**Principle:** Items at the beginning (primacy) and end (recency) of a list are remembered best.

**Application:**
- Navigation: Most important items first and last
- Lists: Key info at top and bottom
- Forms: Most critical fields at start
- CTAs: Repeat at top and bottom of long pages

**Example:**
```
Navigation: Home | [key items] | Contact

Long landing page:
- CTA at hero (top)
- Content sections
- CTA repeated at bottom
```

### Jakob’s Law

**Principle:** Users spend most of their time on other sites. They prefer your site to work the same way as all the other sites they already know.

**Application:**
- **Patterns:** Use standard placement for search bars and carts.
- **Mental Models:** Leverage familiar icons (e.g., a magnifying glass).
- **Vocabulary:** Use "Log In" instead of "Enter the Portal."
- **Layout:** Keep the logo in the top-left for "Home" navigation.
- **Interaction:** Swiping right to go back/next should feel native.
- **Feedback:** Standard colors (Red = Error, Green = Success).

**Example:**
```
❌ Bad: A website where clicking the logo takes you to an "About Us" page.
✅ Good: Clicking the logo always returns the user to the Homepage.

❌ Bad: Using a "Star" icon to represent "Delete."
✅ Good: Using a "Trash Can" icon to represent "Delete."
```

---

### Tesler’s Law (Conservation of Complexity)

**Principle:** For any system, there is a certain amount of complexity which cannot be reduced, only shifted from user to software.

**Application:**
- **Backend:** Let the system handle formatting (e.g., currency).
- **Detection:** Auto-detect card type or city via ZIP code.
- **Automation:** Pre-fill returning user data.
- **Personalization:** Show only relevant fields based on previous answers.
- **Defaults:** Smart defaults for common settings.
- **Integration:** Use SSO (Social Logins) to offload registration friction.

**Example:**
```
❌ Bad: Making users type "USD $" before every price field in a form.
✅ Good: The app automatically prefixing the "$" based on the user's location.

❌ Bad: Forcing users to manually select their "Card Type" (Visa/Mastercard).
✅ Good: Detecting the card type automatically from the first four digits entered.
```

---

### Parkinson’s Law

**Principle:** Any task will inflate until all available time is spent.

**Application:**
- **Efficiency:** Use "Auto-save" to reduce task completion time.
- **Speed:** Limit the steps in a conversion funnel.
- **Clarity:** Use clear labels to prevent "hover-poking" for meaning.
- **Feedback:** Real-time validation to stop users from wasting time on errors.
- **Onboarding:** Quick "Express" setup for power users.
- **Constraints:** Set character limits on inputs to focus thoughts.

**Example:**
```
❌ Bad: A 10-page registration form that allows users to browse away and lose data.
✅ Good: A "One-Tap Sign In" using Google or Apple ID.

❌ Bad: Giving a user an indefinite amount of time to fill out a bio.
✅ Good: Providing a "Suggested Bios" feature to help them finish in seconds.
```

---

### Doherty Threshold

**Principle:** Productivity skyrockets when a computer and its users interact at a pace (<400ms) that ensures neither has to wait on the other.

**Application:**
- **Feedback:** Use immediate visual cues for clicks.
- **Loading:** Use skeleton screens for perceivable performance.
- **Optimism:** Update UI before the server responds (Optimistic UI).
- **Motion:** Use micro-animations to mask slight delays.
- **Caching:** Pre-load next pages or assets in the background.
- **Prioritization:** Load text content before heavy high-res images.

**Example:**
```
❌ Bad: A button that does nothing for 2 seconds after being clicked.
✅ Good: A button that immediately changes color and shows a "Loading" spinner.

❌ Bad: A blank white screen that appears while data is fetching.
✅ Good: A skeleton screen showing the gray outlines of where content will appear.
```

---

### Postel’s Law (Robustness Principle)

**Principle:** Be conservative in what you do, be liberal in what you accept from others.

**Application:**
- **Error Handling:** Don't error out for a missing space or dash.
- **Formatting:** Accept dates in DD/MM/YYYY or MM/DD/YYYY.
- **Inputs:** Strip trailing/leading white space automatically.
- **Fallbacks:** Use default avatars if a user hasn't uploaded a photo.
- **Search:** Accept typos and provide "Did you mean...?" suggestions.
- **Accessibility:** Ensure the site works across all browsers and devices.

**Example:**
```
❌ Bad: Rejecting a phone number because the user put a space in it.
✅ Good: Accepting the input and stripping the spaces automatically.

❌ Bad: Forcing users to type "January" instead of "01" or "Jan."
✅ Good: A date field that understands all three formats.
```

---

### Occam’s Razor

**Principle:** Among competing hypotheses that predict equally well, the one with the fewest assumptions should be selected. The simplest solution is usually the best.

**Application:**
- **Logic:** Remove unnecessary clicks.
- **Visuals:** Use only as many fonts/colors as strictly necessary.
- **Function:** If one field can do the work of two, combine them.
- **Copy:** Use the shortest possible text to convey meaning.
- **Layout:** Remove decorative elements that don't serve a goal.
- **Flow:** Avoid branching paths unless absolutely required.

**Example:**
```
❌ Bad: A "Login" button that opens a new page, then email, then password.
✅ Good: A single login modal that asks for both on one screen.

❌ Bad: Using 5 different font sizes and 4 colors on a single card.
✅ Good: Using 2 font sizes and 1 accent color.
```

---

## 2. Visual Perception (Gestalt Principles)

### Law of Proximity

**Principle:** Objects that are near, or proximate to each other, tend to be grouped together.

**Application:**
- **Grouping:** Keep labels physically close to input fields.
- **Spacing:** Larger margins between unrelated content blocks.
- **Cards:** Text inside a card should be closer to its image than the border.
- **Footers:** Cluster legal links together away from social links.
- **Navigation:** Group "User" settings separate from "App" settings.
- **Forms:** Group Address fields together, separate from Credit Card fields.

**Example:**
```
❌ Bad: Large, equal gaps between every line of text in a form.
✅ Good: Tight spacing between a label and its input, with larger gaps between pairs.

❌ Bad: A "Submit" button floating in the middle of a page, far from the form.
✅ Good: The "Submit" button placed directly under the last input field.
```

---

### Law of Similarity

**Principle:** The human eye tends to perceive similar elements in a design as a complete picture, shape, or group, even if those elements are separated.

**Application:**
- **Consistency:** Consistent colors for all clickable links.
- **Iconography:** All icons in a set should have the same stroke weight.
- **Buttons:** Same shape/size for buttons with the same importance.
- **Typography:** Use the same H2 style for all section headers.
- **Feedback:** All "Delete" actions should use the same color (e.g. Red).
- **States:** Hover and Active states must be consistent across the app.

**Example:**
```
❌ Bad: Some links are blue, some are green, and some are just bold black.
✅ Good: Every clickable text element in the app is the same shade of Blue.

❌ Bad: Using a "Blue Button" for "Submit" and the same "Blue Button" for "Cancel."
✅ Good: "Submit" is Solid Blue; "Cancel" is a Blue Outline (Ghost Button).
```

---

### Law of Common Region

**Principle:** Elements tend to be perceived into groups if they are sharing an area with a clearly defined boundary.

**Application:**
- **Containerizing:** Use cards to group images and titles.
- **Borders:** Use lines to separate the sidebar from the main feed.
- **Backgrounds:** Use a different background color for the footer.
- **Modals:** Use a distinct box to separate pop-ups from the page.
- **Lists:** Alternating background colors (zebra striping) for rows.
- **Header:** A solid bar across the top to group navigation items.

**Example:**
```
❌ Bad: A list of news articles where the text and image of different stories overlap.
✅ Good: Each article is contained within its own white card on a light gray background.

❌ Bad: A footer that has the same background color as the main body.
✅ Good: A dark-themed footer that clearly separates legal links from page content.
```

---

### Law of Uniform Connectedness

**Principle:** Elements that are visually connected (e.g., via lines, arrows) are perceived as more related than elements with no connection.

**Application:**
- **Flow:** Use lines to connect steps in a progress wizard.
- **Menus:** Dropdowns that "touch" or connect to their parent button.
- **Graphs:** Lines connecting data points in a chart.
- **Relationship:** Connecting a toggle switch to the text it controls.
- **Hierarchy:** Tree structures for file directories.
- **Forms:** Connecting a "Credit Card" radio button to the fieldset below it.

**Example:**
```
❌ Bad: A 3-step setup where the numbers "1", "2", and "3" are scattered.
✅ Good: A horizontal line connecting "1", "2", and "3" to show a sequence.

❌ Bad: Floating dropdown menus that don't touch the button that opened them.
✅ Good: A dropdown menu that visually "attaches" to the parent button.
```

---

### Law of Prägnanz (Simplicity)

**Principle:** People will perceive and interpret ambiguous or complex images as the simplest form possible, because it is the interpretation that requires the least cognitive effort.

**Application:**
- **Clarity:** Use clear, geometric icons for navigation.
- **Reduction:** Remove unnecessary 3D textures or shadows.
- **Shapes:** Prefer standard rectangles/circles over complex polygons.
- **Focus:** Use high-contrast silhouettes for primary actions.
- **Logos:** Simple brand marks that are recognizable at small sizes.
- **UX:** One main goal per page to keep the "mental shape" simple.

**Example:**
```
❌ Bad: A hyper-realistic 3D illustration of a file folder for the "Files" icon.
✅ Good: A simple 2D outline of a folder.

❌ Bad: A multi-colored, complex logo used as a loading spinner.
✅ Good: A simple, single-color circular ring.
```

---

### Law of Figure/Ground

**Principle:** The eye differentiates an object from its surrounding area. a form, silhouette, or shape is perceived as figure (object), while the surrounding area is perceived as ground (background).

**Application:**
- **Focus:** Use overlays (scrims) for modals to pop the content.
- **Depth:** Drop shadows to imply the "figure" is sitting above the "ground."
- **Contrast:** Light text on dark ground (or vice versa).
- **Blur:** Use background blur to emphasize foreground text.
- **Navigation:** Floating sticky headers that stay above the page content.
- **Hover:** Elevate cards slightly on hover to define them as the figure.

**Example:**
```
❌ Bad: A popup window that has no shadow or border, blending into the page.
✅ Good: A modal with a drop shadow and a dimmed background overlay.

❌ Bad: White text placed directly over a busy, multi-colored photograph.
✅ Good: White text placed over a dark semi-transparent "scrim."
```

---

### Law of Focal Point

**Principle:** Whatever stands out visually will capture and hold the viewer’s attention first.

**Application:**
- **Entry:** Place the primary value proposition at the focal point.
- **Color:** Use one high-vibrancy "Action Color" against a neutral UI.
- **Movement:** Use subtle animation on the CTA to draw the eye.
- **Size:** The most important statistic should be the largest font.
- **Typography:** Use bold weights for headers and standard weights for body.
- **Direction:** Use arrows or gaze (images of people looking at a button).

**Example:**
```
❌ Bad: A homepage with 5 buttons of the same size and color.
✅ Good: One large "Get Started" button in a bright color.

❌ Bad: A dashboard where "Total Revenue" is the same size as "System Version."
✅ Good: "Total Revenue" displayed in huge, bold numbers at the top center.
```

---

## 3. Cognitive Biases & Behavior

### Zeigarnik Effect

**Principle:** People remember uncompleted or interrupted tasks better than completed tasks.

**Application:**
- **Gamification:** Use "Profile 60% complete" bars.
- **Engagement:** Tease the next module in a learning path.
- **Retention:** Show a "To-Do" list of features yet to be explored.
- **Feedback:** Persistent badges for unread messages.
- **Momentum:** Show "Next" steps immediately after completing one.
- **Shopping:** "Finish your order" reminders in the cart.

**Example:**
```
❌ Bad: A silent onboarding process that gives no indication of what's left.
✅ Good: A checklist that shows "3 of 5 steps finished."

❌ Bad: An e-learning app that shows a checkmark even if a video was half-watched.
✅ Good: A progress ring that stays half-full until the video is finished.
```

### Goal Gradient Effect

**Principle:** The tendency to approach a goal increases with proximity to the goal.

**Application:**
- **Momentum:** Give users "Artificial Advancement" (e.g. 2 free stamps).
- **Progress:** Break a 10-field form into two 5-field steps.
- **Feedback:** Celebrate milestones halfway through a task.
- **Motivation:** Show the user how close they are to a reward/status.
- **Navigation:** Use breadcrumbs to show how close they are to the end.
- **Loading:** Speed up the loading animation as it nears 100%.

**Example:**
```
❌ Bad: A progress bar that starts at 0% and feels like a long climb.
✅ Good: A bar that starts at 20% because the user "started" by opening the app.

❌ Bad: A checkout flow where the "Final Review" feels like a surprise 5th step.
✅ Good: Clearly labeling the steps: "Shipping > Payment > Almost Done!"
```

### Peak-End Rule

**Principle:** People judge an experience largely based on how they felt at its peak (the most intense point) and at its end, rather than the total sum or average of every moment.

**Application:**
- **Success:** Make the "Order Confirmed" screen memorable.
- **Delight:** Add confetti or a unique animation at the point of value.
- **Support:** Ensure the final interaction with a chat bot is helpful.
- **Unboarding:** Even when a user leaves, make the final exit clean.
- **Onboarding:** End the first session with a clear "Win."
- **Error Handling:** Turn a 404 page into a fun, helpful interaction.

**Example:**
```
❌ Bad: After a 20-minute tax filing process, the app just says "Submitted."
✅ Good: A "Congratulations!" screen with a summary of the refund amount.

❌ Bad: A game that ends with a simple "Game Over" text in plain font.
✅ Good: A summary screen showing high scores with celebratory music.
```

### Aesthetic-Usability Effect

**Principle:** Users often perceive aesthetically pleasing design as design that’s more usable.

**Application:**
- **Trust:** High-fidelity visuals buy "trust credit" for minor bugs.
- **Branding:** Consistent high-quality imagery build professionalism.
- **Engagement:** Beautiful interfaces keep users exploring longer.
- **Patience:** Users are more forgiving of load times if the UI is pretty.
- **Confidence:** Clean design makes complex tools feel more manageable.
- **Loyalty:** People form emotional bonds with beautiful products.

**Example:**
```
❌ Bad: A banking app with misaligned text and clashing 1990s colors.
✅ Good: A sleek, modern banking app with smooth animations.

❌ Bad: Using low-resolution, pixelated stock photos.
✅ Good: Using high-definition, custom brand illustrations.
```

### Anchoring Bias

**Principle:** Users rely heavily on the first piece of information offered (the "anchor") when making decisions.

**Application:**
- **Pricing:** Show the original price crossed out.
- **Tiers:** Put the most expensive "Enterprise" plan on the far left.
- **Sorting:** Highlight "Most Popular" as the first recommendation.
- **Discounts:** State the "Save 20%" before showing the final price.
- **Limits:** "Limit 12 per customer" anchors the idea that it's high value.
- **Defaults:** Start with a high "Suggested Donation" amount.

**Example:**
```
❌ Bad: Only showing the price "$49."
✅ Good: Showing "~~$99~~ $49 (50% Off)."

❌ Bad: Sorting a list of laptops from cheapest to most expensive.
✅ Good: Showing a high-end "Pro" model first to make others seem cheap.
```

### Social Proof

**Principle:** People copy the actions of others in an attempt to undertake behavior in a given situation.

**Application:**
- **Validation:** Display "Join 50,000+ others."
- **Reviews:** Star ratings and verified customer testimonials.
- **Logos:** "Trusted by" section showing partner brands.
- **Live Feed:** "Sarah just bought this 5 mins ago" notifications.
- **Activity:** "300 people are currently viewing this item."
- **Certificates:** Industry awards and security badges.

**Example:**
```
❌ Bad: A signup page with just a form.
✅ Good: A signup page that says "Join 2 million designers."

❌ Bad: Anonymous reviews with no names or photos.
✅ Good: Reviews that include a face, a name, and a "Verified Buyer" tag.
```

### Scarcity Principle

**Principle:** Humans place a higher value on an object that is scarce, and a lower value on those that are in abundance.

**Application:**
- **Urgency:** "Only 2 items left in stock."
- **Time:** Ticking countdown timers for sales.
- **Access:** "Invite-only" betas or exclusive tiers.
- **Seasonality:** "Summer Edition" products.
- **Low Stock:** "Back in stock soon - pre-order now."
- **Demand:** "In high demand - 10 people have this in their cart."

**Example:**
```
❌ Bad: A sale that never ends and has no countdown.
✅ Good: A "Deal of the Day" with a ticking timer.

❌ Bad: Showing a product is available with no stock count.
✅ Good: "Only 3 left at this price!"
```

### Authority Bias

**Principle:** The tendency to attribute greater accuracy to the opinion of an authority figure and be more influenced by that opinion.

**Application:**
- **Expertise:** Use "Expert-verified" or professional headshots.
- **Certifications:** Trust seals (Norton, ISO, HIPAA).
- **Media:** "As seen on TechCrunch/Forbes" logos.
- **Endorsements:** Testimonials from industry leaders or influencers.
- **Language:** Confident, professional, and accurate copy.
- **History:** "Established in 1950" to imply longevity and trust.

**Example:**
```
❌ Bad: A health blog written by "Admin."
✅ Good: A health article "Reviewed by Dr. Jane Smith, Cardiologist."

❌ Bad: A security app with no mentions of certifications.
✅ Good: Displaying "ISO 27001 Certified" and "Norton Secured" logos.
```

### Loss Aversion

**Principle:** People generally prefer avoiding losses to acquiring equivalent gains. It is better to not lose $5 than to find $5.

**Application:**
- **Messaging:** "Don't lose your discount."
- **Trials:** "Your free trial is ending - keep your data now."
- **Scarcity:** "Once it's gone, it's gone for good."
- **Carts:** "Don't miss out on the items in your cart."
- **Loyalty:** "You've earned 500 points - don't let them expire."
- **Risk:** "30-day money-back guarantee" (reduces the "loss" of money).

**Example:**
```
❌ Bad: "Click here to get a $10 coupon."
✅ Good: "You have a $10 credit waiting. Use it before it expires tonight!"

❌ Bad: "Cancel your subscription."
✅ Good: "If you cancel, you will lose access to your 50 saved projects."
```

### False-Consensus Effect

**Principle:** People tend to overestimate the extent to which their opinions, beliefs, preferences, values, and habits are normal and typical of those of others.

**Application:**
- **Testing:** You are not the user - test with real target audiences.
- **Research:** Use qualitative data (interviews) and quantitative data (analytics).
- **Bias:** Use "Blind Design Reviews" to avoid personal favoritism.
- **Persona:** Stick to established User Personas over personal hunches.
- **Variation:** Test with users from different demographics/abilities.
- **Objectivity:** Use heatmaps to see actual user behavior.

**Example:**
```
❌ Bad: A designer deciding a feature is "intuitive" without testing it.
✅ Good: Running an A/B test to see which version users prefer.

❌ Bad: Building an app entirely in English because "everyone knows English."
✅ Good: Adding localization based on actual user location data.
```

### Curse of Knowledge

**Principle:** A cognitive bias that occurs when an individual, communicating with other individuals, unknowingly assumes that the others have the background to understand.

**Application:**
- **Copy:** Avoid jargon and use plain language.
- **Onboarding:** Tutorials that assume the user knows nothing.
- **Tooltips:** Explain complex terms on hover.
- **Structure:** Progressive disclosure (hide advanced settings).
- **Labels:** Use icons + text labels for navigation (don't rely on icons alone).
- **Support:** Comprehensive FAQs for first-time users.

**Example:**
```
❌ Bad: An error message saying "Exception: Null Pointer at 0x0045."
✅ Good: An error message saying "Something went wrong. Please try refreshing."

❌ Bad: Navigating a cloud app using terms like "S3 Bucket Instances."
✅ Good: Using simple terms like "File Storage."
```

### Stepping Stone Effect (Foot-in-the-Door)

**Principle:** Users commit to large tasks if they start with small ones.

**Application:**
- **Funnel:** Ask for email before asking for credit card.
- **Engagement:** Ask for one preference (e.g. "Dark Mode?") before registration.
- **Onboarding:** Use a series of "Quick Yes/No" questions.
- **Trust:** Offer a free PDF/tool before asking for a subscription.
- **Profile:** Ask to upload a photo first, then fill out the bio later.
- **Sales:** Offer a low-cost "tripwire" product before the main service.

**Example:**
```
❌ Bad: A "Start Free Trial" button that immediately requires credit card info.
✅ Good: Asking for an email and password first, then offering the trial.

❌ Bad: A survey that shows all 50 questions on one page.
✅ Good: A survey that starts with one easy "Yes/No" question.
```

---

## 2. Emotional Design (Don Norman)

### Three Levels of Processing

```
┌─────────────────────────────────────────────────────────────┐
│  VISCERAL (Lizard Brain)                                    │
│  ─────────────────────                                      │
│  • Immediate, automatic reaction                            │
│  • First impressions (first 50ms)                          │
│  • Aesthetics: colors, shapes, imagery                      │
│  • "Wow, this looks beautiful!"                            │
├─────────────────────────────────────────────────────────────┤
│  BEHAVIORAL (Functional Brain)                              │
│  ─────────────────────────────                              │
│  • Usability and function                                   │
│  • Pleasure from effective use                              │
│  • Performance, reliability, ease                           │
│  • "This works exactly how I expected!"                    │
├─────────────────────────────────────────────────────────────┤
│  REFLECTIVE (Conscious Brain)                               │
│  ─────────────────────────────                              │
│  • Conscious thought and meaning                            │
│  • Personal identity and values                             │
│  • Long-term memory and loyalty                             │
│  • "This brand represents who I am"                        │
└─────────────────────────────────────────────────────────────┘
```

### Designing for Each Level

**Visceral:**
```css
/* Beautiful first impression */
.hero {
  background: linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%);
  color: white;
}

/* Pleasing microinteractions */
.button:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

**Behavioral:**
```javascript
// Instant feedback
button.onclick = () => {
  button.disabled = true;
  button.textContent = 'Saving...';
  
  save().then(() => {
    showSuccess('Saved!');  // Immediate confirmation
  });
};
```

**Reflective:**
```html
<!-- Brand story and values -->
<section class="about">
  <h2>Why We Exist</h2>
  <p>We believe technology should empower, not complicate...</p>
</section>

<!-- Social proof connecting to identity -->
<blockquote>
  "This tool helped me become the designer I wanted to be."
</blockquote>
```

---

## 3. Trust Building System

### Trust Signal Categories

| Category | Elements | Implementation |
|----------|----------|----------------|
| **Security** | SSL, badges, encryption | Visible padlock, security logos on forms |
| **Social Proof** | Reviews, testimonials, logos | Star ratings, customer photos, brand logos |
| **Transparency** | Policies, pricing, contact | Clear links, no hidden fees, real address |
| **Professional** | Design quality, consistency | No broken elements, consistent branding |
| **Authority** | Certifications, awards, media | "As seen in...", industry certifications |

### Trust Signal Placement

```
┌────────────────────────────────────────────────────┐
│  HEADER: Trust banner ("Free shipping | 30-day    │
│          returns | Secure checkout")               │
├────────────────────────────────────────────────────┤
│  HERO: Social proof ("Trusted by 10,000+")        │
├────────────────────────────────────────────────────┤
│  PRODUCT: Reviews visible, security badges         │
├────────────────────────────────────────────────────┤
│  CHECKOUT: Payment icons, SSL badge, guarantee     │
├────────────────────────────────────────────────────┤
│  FOOTER: Contact info, policies, certifications    │
└────────────────────────────────────────────────────┘
```

### Trust-Building CSS Patterns

```css
/* Trust badge styling */
.trust-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #F0FDF4;  /* Light green = security */
  border-radius: 2px; /* Sharp for trust = precision feel */
  font-size: 14px;
  color: #166534;
}

/* Secure form indicator */
.secure-form::before {
  content: '🔒 Secure form';
  display: block;
  font-size: 12px;
  color: #166534;
  margin-bottom: 8px;
}

/* Testimonial card */
.testimonial {
  display: flex;
  gap: 16px;
  padding: 24px;
  background: white;
  border-radius: 16px; /* Friendly = larger radius */
  box-shadow: var(--shadow-sm);
}

.testimonial-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;  /* Real photos > initials */
}
```

---

## 4. Cognitive Load Management

### Three Types of Cognitive Load

| Type | Definition | Designer's Role |
|------|------------|-----------------|
| **Intrinsic** | Inherent complexity of task | Break into smaller steps |
| **Extraneous** | Load from poor design | Eliminate this! |
| **Germane** | Effort for learning | Support and encourage |

### Reduction Strategies

**1. Simplify (Reduce Extraneous)**
```css
/* Visual noise → Clean */
.card-busy {
  border: 2px solid red;
  background: linear-gradient(...);
  box-shadow: 0 0 20px ...;
  /* Too much! */
}

.card-clean {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1);
  /* Calm, focused */
}
```

**2. Chunk Information**
```html
<!-- Overwhelming -->
<form>
  <!-- 15 fields at once -->
</form>

<!-- Chunked -->
<form>
  <fieldset>
    <legend>Step 1: Personal Info</legend>
    <!-- 3-4 fields -->
  </fieldset>
  <fieldset>
    <legend>Step 2: Shipping</legend>
    <!-- 3-4 fields -->
  </fieldset>
</form>
```

**3. Progressive Disclosure**
```html
<!-- Hide complexity until needed -->
<div class="filters">
  <div class="filters-basic">
    <!-- Common filters visible -->
  </div>
  <button onclick="toggleAdvanced()">
    Advanced Options ▼
  </button>
  <div class="filters-advanced" hidden>
    <!-- Complex filters hidden -->
  </div>
</div>
```

**4. Use Familiar Patterns**
```
✅ Standard navigation placement
✅ Expected icon meanings (🔍 = search)
✅ Conventional form layouts
✅ Common gesture patterns (swipe, pinch)
```

**5. Offload Information**
```html
<!-- Don't make users remember -->
<label>
  Card Number
  <input type="text" inputmode="numeric" 
         autocomplete="cc-number" 
         placeholder="1234 5678 9012 3456">
</label>

<!-- Show what they entered -->
<div class="order-summary">
  <p>Shipping to: <strong>John Doe, 123 Main St...</strong></p>
  <a href="#">Edit</a>
</div>
```

---

## 5. Persuasive Design (Ethical)

### Ethical Persuasion Techniques

| Technique | Ethical Use | Dark Pattern (Avoid) |
|-----------|-------------|----------------------|
| **Scarcity** | Real stock levels | Fake countdown timers |
| **Social Proof** | Genuine reviews | Fake testimonials |
| **Authority** | Real credentials | Misleading badges |
| **Urgency** | Real deadlines | Manufactured FOMO |
| **Commitment** | Progress saving | Guilt-tripping |

### Nudge Patterns

**Smart Defaults:**
```html
<!-- Pre-select the recommended option -->
<input type="radio" name="plan" value="monthly">
<input type="radio" name="plan" value="annual" checked>
  Annual (Save 20%)
```

**Anchoring:**
```html
<!-- Show original price to frame discount -->
<div class="price">
  <span class="original">$99</span>
  <span class="current">$79</span>
  <span class="savings">Save 20%</span>
</div>
```

**Social Proof:**
```html
<!-- Real-time activity -->
<div class="activity">
  <span class="avatar">👤</span>
  <span>Sarah from NYC just purchased</span>
</div>

<!-- Aggregate proof -->
<p>Join 50,000+ designers who use our tool</p>
```

**Progress & Commitment:**
```html
<!-- Show progress to encourage completion -->
<div class="progress">
  <div class="progress-bar" style="width: 60%"></div>
  <span>60% complete - almost there!</span>
</div>
```

---

## 6. User Persona Quick Reference

### Gen Z (Born 1997-2012)

```
CHARACTERISTICS:
- Digital natives, mobile-first
- Value authenticity, diversity
- Short attention spans
- Visual learners

DESIGN APPROACH:
├── Colors: Vibrant, hypercolor, bold gradients
├── Typography: Large, variable, experimental
├── Layout: Vertical scroll, mobile-native
├── Interactions: Fast, gamified, gesture-based
├── Content: Short-form video, memes, stories
└── Trust: Peer reviews > authority
```

### Millennials (Born 1981-1996)

```
CHARACTERISTICS:
- Value experiences over things
- Research before buying
- Socially conscious
- Price-sensitive but quality-aware

DESIGN APPROACH:
├── Colors: Muted pastels, earth tones
├── Typography: Clean, readable sans-serif
├── Layout: Responsive, card-based
├── Interactions: Smooth, purposeful animations
├── Content: Value-driven, transparent
└── Trust: Reviews, sustainability, values
```

### Gen X (Born 1965-1980)

```
CHARACTERISTICS:
- Independent, self-reliant
- Value efficiency
- Skeptical of marketing
- Balanced tech comfort

DESIGN APPROACH:
├── Colors: Professional, trustworthy
├── Typography: Familiar, conservative
├── Layout: Clear hierarchy, traditional
├── Interactions: Functional, not flashy
├── Content: Direct, fact-based
└── Trust: Expertise, track record
```

### Baby Boomers (Born 1946-1964)

```
CHARACTERISTICS:
- Detail-oriented
- Loyal when trusted
- Value personal service
- Less tech-confident

DESIGN APPROACH:
├── Colors: High contrast, simple palette
├── Typography: Large (18px+), high contrast
├── Layout: Simple, linear, spacious
├── Interactions: Minimal, clear feedback
├── Content: Comprehensive, detailed
└── Trust: Phone numbers, real people
```

---

## 7. Emotion Color Mapping

```
┌────────────────────────────────────────────────────┐
│  EMOTION          │  COLORS           │  USE       │
├───────────────────┼───────────────────┼────────────┤
│  Trust            │  Blue, Green      │  Finance   │
│  Excitement       │  Red, Orange      │  Sales     │
│  Calm             │  Blue, Soft green │  Wellness  │
│  Luxury           │  Black, Gold      │  Premium   │
│  Creativity       │  Teal, Pink       │  Art       │
│  Energy           │  Yellow, Orange   │  Sports    │
│  Nature           │  Green, Brown     │  Eco       │
│  Happiness        │  Yellow, Orange   │  Kids      │
│  Sophistication   │  Gray, Navy       │  Corporate │
│  Urgency          │  Red              │  Errors    │
└───────────────────┴───────────────────┴────────────┘
```

---

## 8. Psychology Checklist

### Before Launch

- [ ] **Hick's Law:** No more than 7 choices in navigation. Have choices been narrowed to reduce decision fatigue?
- [ ] **Fitts' Law:** Primary CTAs are large and reachable. Are the most important buttons easy to hit on mobile?
- [ ] **Miller's Law:** Content is chunked appropriately. Is information grouped into digestible units of 5-7?
- [ ] **Jakob's Law:** Does the site follow standard web conventions that users already understand?
- [ ] **Doherty Threshold:** Does the system provide feedback within 400ms? Are skeleton screens in place?
- [ ] **Tesler's Law:** Has complexity been moved from the user to the system where possible?
- [ ] **Parkinson’s Law:** Are there features like "One-Click Checkout" to minimize task completion time?
- [ ] **Von Restorff:** Does the primary CTA visually stand out from all other elements?
- [ ] **Serial Position:** Is the most critical information at the very beginning or end of lists?
- [ ] **Gestalt Laws:** Are related items physically grouped together (Proximity) or within a Card (Common Region)?
- [ ] **Zeigarnik Effect:** Are there visual indicators (like progress bars) for incomplete tasks?
- [ ] **Goal Gradient:** Is the user given a "head start" (e.g., 20% progress) to encourage completion?
- [ ] **Peak-End Rule:** Does the final "Success" screen create a moment of delight?
- [ ] **Occam’s Razor:** Have unnecessary visual or functional elements been removed?
- [ ] **Aesthetic-Usability:** Is the UI high-fidelity enough to build initial user trust?
- [ ] **Trust & Authority:** Are security badges, reviews, and expert certifications visible?
- [ ] **Social Proof:** Are real user numbers or testimonials visible at decision points?
- [ ] **Scarcity & Urgency:** If used, is the scarcity real and ethical (e.g., actual low stock)?
- [ ] **Loss Aversion:** Does the copy emphasize what the user stands to keep rather than just gain?
- [ ] **Anchoring:** Is the pricing presented in a way that frames the desired choice as a great value?
- [ ] **Postel’s Law:** Is the system flexible enough to accept various input formats without errors?
- [ ] **False-Consensus:** Has the design been tested with real users rather than just the internal team?
- [ ] **Curse of Knowledge:** Is the copy free of technical jargon and easy for a beginner to understand?
- [ ] **Stepping Stone:** Does the funnel start with low-friction tasks (e.g., email only)?
- [ ] **Cognitive Load:** Is extraneous visual noise minimized to keep the interface clean?
- [ ] **Emotional Design:** Does the color palette and imagery evoke the intended visceral reaction?
- [ ] **Feedback:** Do all interactive elements have immediate hover, active, and success states?
- [ ] **Accessibility:** Is the contrast ratio sufficient, and is the site navigable via keyboard/screen reader?
- [ ] **Prägnanz:** Are icons and shapes simple enough to be recognized at a glance?
- [ ] **Figure/Ground:** Is it clear which element is in focus (e.g., using shadows or scrims for modals)?
