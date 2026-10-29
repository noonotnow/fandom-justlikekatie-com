# C-drama MemeForge Social Studio

The launchpad's **C-drama MemeForge** entry opens `/memeforge/c-drama`.
The existing `/memeforge/middle-earth` studio remains separate.

## Creator workflow

1. Describe what made you laugh in your own words, including any remembered
   scene, drama, character, or phrase. No prompt jargon is required.
2. By default, keep the user's intended joke rather than impose comedy lanes.
   Optional style preferences remain subordinate to that intent.
3. Sign in with the existing email-link flow, then generate three wordings
   of the intended joke.
   After email verification, return to the studio and use **I've signed in ·
   check again** if the original tab still shows the sign-in form.
4. Select an angle and edit its setup, punchline, or reaction direction.
5. Search for a clean still and select it explicitly, or upload a JPEG, PNG,
   or WebP image under 8 MB. Search results are leads, not rights clearance or
   verified scene provenance. Images can also be chosen before generating.
6. Keep the full still or fill/crop the frame, adjusting the vertical position.
7. Choose TikTok 9:16 (1080×1920) or Instagram 4:5 (1080×1350).
8. Edit the TikTok hook/caption and Instagram caption. Remove optional hashtags
   if not wanted. Copy and download are separate actions.

The PNG is a still composition for manual posting, not a video or carousel.
The setup sits above a clean image and the punchline below it. Text never
overlays the still; preview and download use the same rendering function.
No platform account, scheduler, publication receipt, or storefront is involved.
The vertical layout reserves room around essential copy, but TikTok's actual
overlays vary by device and composition mode.

## Draft and privacy boundaries

The bounded working draft is stored in this browser only. It is not an account
Collection, MEDIA publication, cloud backup, or a Middle-earth save.
Clearing the draft removes it from local storage. Brief edits, image searches,
failed searches, uploads, image changes, and text edits preserve the selected
image and existing edited post copy. Switching joke options preserves the image
but resets suggested post copy. **Suggest new wording** stages alternatives;
the current meme stays unchanged until the creator explicitly chooses one.
Accepting replacement wording resets suggested post copy, not the image.
Format changes retain both destination captions and redraw the meme.

Uploads are resized locally for bounded persistence. If storage fails, the
studio warns that the tab must remain open and removes the older saved copy
when possible rather than pretending the latest work was saved.
Generating ideas sends the moment and optional context to xAI. Image searches
send the search phrase through the existing image provider infrastructure.

## Verification and release boundary

Automated coverage includes signed-in generation contracts, rate limits,
legacy/commercial contamination rejection, local recovery, delayed-response
invalidation, upload fallback, storage/clipboard errors, expired sessions,
no Collection/media publication, preview/download pixel parity, and both PNG
dimensions at desktop/phone viewport sizes.

Before the intent-preserving revision, small live xAI samples were manually reviewed for viewer self-owns, tea-order
relationship contradictions, and group-chat/sect disputes. Initial output
occasionally described imagined viewer photography instead of clean drama
stills, so the production contract now rejects those briefs and permits one
bounded retry. Those samples do not certify the newer intent-preserving prompt.
Generated humor still needs the creator's selection and edits.

The repository's `npm run dev` is frontend-only; it does not serve Netlify
Functions. Successful local tests and model samples are not a claim that the
Netlify production endpoints or a signed-in live-site flow have been verified.
Release still requires the existing independently reviewed GitHub/Netlify path.

The review branch is based on GitHub main, not the workspace's divergent history.
On that combined tree: 504 app tests, 1,398 function tests, and 628 script tests
passed (two existing script skips); all three C-drama browser flows passed.
Type checking, the test-import guard, and the Vite production frontend build also
passed. The unrelated Godot game prebuild and full legacy browser suite were not
rerun for this pull request; repository CI remains required before merge.

Earlier script failures in the development workspace were not carried into this
branch. No editorial articles or retained-reading digests were changed or
re-certified as part of this release.
