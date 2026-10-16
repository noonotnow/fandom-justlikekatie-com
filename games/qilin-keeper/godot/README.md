# Qilin Keeper — Small Paws

A first playable **Godot** scene, not the finished care game.

## Open on your Mac
1. Unzip the download in **Finder** into a folder (rather than asking Godot
   to extract the ZIP).
2. Open Godot 4.4 or newer (your Godot 4.7.2 download should be suitable).
3. In Project Manager choose **Import**, select this folder's **project.godot**,
   and open the project. Let Godot import the assets.
4. Press **F6** to play the current scene or **F5 / the Play button** to play the project.

No plugins, package installs, API keys, or coding required.

If Godot reports “files failed extraction from package,” cancel that ZIP
import, double-click the ZIP in Finder, and import the extracted
**project.godot** file instead. The ZIP contains the artwork and sounds.

## Play
- **Cloud ride / Y:** square sunglasses, the same windbreaker, and a low
  cloud you can steer through the courtyard. Arrow keys or hold-drag steer;
  **Land**, **Y**, or **Esc** returns to care. Pausing freezes the ride,
  and care progress, cup contents, and mess are preserved while flying.
  The browser preview opens on flight; native Godot opens on care.
  Music playback is not connected yet.
- **Reduced motion:** the saved local preference shortens cloud takeoff and
  reduces cloud sway, leaning, breathing, and paw movement. Cloud trail puffs
  are hidden, and toy play has a gentler walking and paw bounce.
  Steering, ball physics and hit targets, boop timing, and sticker rewards are
  unchanged. The setting also covers wake-up and courtyard care; resetting
  care does not reset it.
- **Case / K:** keepsakes for first takeoff and first landing, regardless of
  performance. Drag them onto the cream cassette-case label, or click to pick
  up and click again to place. Q/E rotates; 1/2 selects, arrows move, Enter
  places, Delete returns the selected sticker to its tray. K/X closes; Esc
  cancels a pickup before closing. The scene rests while you decorate.
  Decoration saves in this browser or on this Mac, not across devices.
  Resetting care does not clear keepsakes. Finishing a bite, drink, or quiet
  cuddle takes priority over opening the case.
- It glances toward its favorite moon-marked cup. Lift the cup to the snout and
  release, or press **J**. The cup tilts as it sips, then returns empty with a
  check mark and a finished message. Click it or press **J** to refill.
- **U** moves the cup between safe and nearby positions. A swat spills only
  water: blue floor puddles need **MOP / V**, never composting or baby cleanup.
  Moonpear mess remains separate if both are spilled.
- Waking from a tucked nap gives a brief sleepy yawn and attached-paw stretch
  before standing care returns. Touch the cheek again, press **N** again, or
  press **Esc** to skip it. Pause freezes the stretch.
  Existing mess and saved care-layer visibility remain unchanged.
- **Esc** sets the cup down; switching tools or choosing affection interrupts
  safely. Pause freezes sipping; reset refills the cup and clears all mess.
- Lift the moonpear bowl to the baby's mouth and release, or press **F** to feed.
  It eats while hungry, visibly one bite at a time. A full baby leans away and
  saves remaining food. Click an empty bowl to refill it; refilling is not feeding.
- Drag the moonpear bowl out of swatting distance. It can be moved anywhere
  along the foreground, not just into a designated slot.
- The same raised paw offers a high-five and threatens whatever is nearby.
  Click the raised paw. Moving the bowl does not cancel the affection.
- Hold the baby's cheek to rest together. Let the settled weight and huff finish.
  Quiet affection is unscored and protected from demands.
- If the bowl spills, drag the fallen moonpear bites into **COMPOST** on the left.
  **G** gathers one bite at a time as a keyboard alternative.
- Hold-drag the striped **CLOTH** on the right onto the baby's sticky paw pads
  and muzzle. Or press **W**, then hold-drag. This cleans the baby, not the floor.
- After gathering the fallen bites, hold-drag the **MOP** from the tray above
  the cloth onto sticky floor patches. Or press **V**, then hold-drag.
- Clean baby and floor in either order. Neither tool cleans the other target.
  **Esc** returns either tool. No second click is needed after mouse pickup.
- Floor residue draws behind the baby. The mop cannot reach through its
  visible body or moving paw; a crossed mop and message direct you to the cloth.
- **BRUSH / T**, in the tray above the mop: click to pick up, then move across the mane and tail
  toward the tuft tips (up and right). Ruffled tufts visibly settle.
  Brush anywhere across the outlined fur areas—not just the small tuft marks.
  No held mouse button or second click is needed once the brush is in hand.
  Short back-and-forth strokes work; a return stroke lightly fluffs unfinished
  fur, but completed areas stay groomed. Holding still does not groom.
- Once both mane and tail are smooth, extra brushing is affection: closed eyes,
  a relaxed lean, and a satisfied huff. No score, demand, or countdown appears.
  **Esc** returns the brush; pause preserves grooming; **R** resets it.
- Grooming never removes sticky paw/muzzle residue or floor mess.
- Routine bathing uses three physical props on the left, separate from accident
  cleanup: hold-drag the **WASH sponge / S** over both exposed mane and tail
  until lathered, then take the **RINSE pitcher / E** to rinse away all bubbles.
  Use the pink **DRY towel / D** until both fur areas are fluffy and dry.
  Lather, damp strands, and dry fur strokes show the result without a care meter.
  Holding still does not progress care. Washing, rinsing, and drying happen in
  that order across both fur areas; a wrong-stage tool leaves care unchanged.
- Water and soap touch exposed fur, not eyes, muzzle, paws, floor, or the
  water-resistant jacket. Bathing never removes accidental sticky residue.
  The first water contact brings a brief surprised wiggle, never a penalty.
  Finished drying settles into quiet affection; extra towel strokes are affection.
  Switch tools by taking another tray prop or using its key. **Esc** returns
  all tools; pause preserves care, while **R** resets the whole routine.
- Refilling or moving the bowl does not erase the floor mess. Cleanup is
  accident care, not routine bathing or brushing. The baby still wants affection.

Keyboard alternatives: **F** feeds, **Space** raises the paw, **B** moves the bowl between
near and safe positions, **H** high-fives, hold **C** to cuddle.
**P** pauses, **R** resets, **M** toggles sound.

There are no challenge timers or affection meters in this prototype.
The later 90-second snack mission is not implemented yet.

## Responsive free play
- A hopeful glance toward the moonpear means hunger. A paw shuffle invites play.
  Heavy eyelids and quiet paws suggest rest; a happy huff can mean enough ball.
  Brief responses explain these tells without a meter dashboard.
- **L / Ball**: roll with drag/release, arrows, or Space. Real paw bats satisfy
  playfulness and use energy. When tired or satisfied, the baby watches instead
  of chasing; ball controls and physics stay the same. **C** goes straight to a
  cuddle; **N** starts a nap; **L / Esc** puts the ball away.
- **N / Nap**: drag the blanket onto its back, or Enter to tuck. Its eyes are
  resting, but it is not asleep yet. Hold the lowered cheek or **C**: its weight
  lowers into your hand, then a satisfied huff marks sleep. Only settled sleep
  restores energy. Touch its cheek or **N** to wake with the sleepy stretch.
- Quiet care lets interest in play return. All needs are gentle and recoverable;
  affection is available regardless of food, energy, interest, or mess.
- Needs freeze on pause, focus loss/backgrounding, cassette decorating and
  cloud rides. No offline deterioration. **R** and reload begin fresh care;
  saved keepsakes and accessibility preferences remain separate.

### Initial tuning (internal, not displayed as meters)
Values are clamped to 0–100. A session starts at hunger 58, energy 78,
interest 72. Awake courtyard time adds 0.08 hunger and 0.25 interest per second,
and uses 0.025 energy per second. Each actual bite relieves 20 hunger; food is
declined at 12 or below. Each successful bat uses 6 energy and 6 interest.
At energy 24 or below, or interest 18 or below, the baby watches instead.
After three seconds of cheek settling, each actual sleeping second restores
1.8 energy and 0.6 interest; hunger rests during sleep. These named rates and
thresholds are centralized for playtesting, not a perfect-care scoring system.
There is no thirst meter or hygiene-decay clock.

## Project
- `scenes/courtyard.tscn`: main scene
- `scripts/courtyard.gd`: interactions and animation
- `scripts/bowl.gd`, `scripts/paw.gd`: drawn interactive props
- `assets/`: character, background, and small original sound effects
- `export_presets.cfg`: single-threaded browser export, Compatibility renderer

The character and courtyard illustrations were adapted from the creator's
provided concept art. The bedroom's franchise characters/posters are not game assets.
