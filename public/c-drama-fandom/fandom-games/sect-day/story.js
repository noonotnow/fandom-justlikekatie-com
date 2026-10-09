export const GAME_ID = "sect-day-v1";
export const GAME_PATH = "/c-drama-fandom/fandom-games/sect-day/";
export const GAME_URL = "https://fandom.justlikekatie.com" + GAME_PATH;
export const ENDINGS = Object.freeze([
  { id: "sect-savior", name: "Reluctant Sect Savior", description: "You repaired the ward instead of becoming its chosen weapon. The sect survives; your reward is a committee asking whether you can do this every Thursday.", tactic: "Read the maintenance problem beneath the prophecy.", ally: "A witness steadies the ward while you close its broken circuit." },
  { id: "three-realms", name: "Wanted by Three Realms", description: "You took the sword beyond the ward. Three realms now claim ownership of the emergency you are carrying. None has offered to carry it for you.", tactic: "A portable solution became a jurisdictional incident.", ally: "Courier Ren finds you a neutral ferry, with a strict no-sword-on-seats policy." },
  { id: "heavenly-vow", name: "Accidentally Bound by a Heavenly Vow", description: "The sword treats your unrestricted oath as a signature. You survive, but Heaven has appointed you Acting Keeper of a Mountain You Have Not Yet Toured.", tactic: "Promising everything made you the cheapest available replacement ward.", ally: "Registrar Sui files an appeal for working hours. Heaven requests three copies." },
  { id: "masters-favorite", name: "Suspicious Master's Favorite", description: "You kept the crisis inside the chain of command. Master Wen gives you a promotion and a key to the cabinet marked NOT A SECOND CRISIS.", tactic: "You made your supervisor responsible for supervising.", ally: "Master Wen stabilizes the sword; Registrar Sui insists your new duties be written down." },
  { id: "before-lunch", name: "Survived by Leaving Before Lunch", description: "You used the visitor exit rather than auditioning for a destiny. The ward closes behind you. You reach the noodle stall alive, unbound, and entirely on schedule.", tactic: "You protected a modest promise and declined an unlimited job.", ally: "You got yourself out. The noodle seller contributes soup, not a rescue." },
  { id: "back-mountain", name: "Sealed in the Back Mountain (Temporarily)", description: "The ward accepts you as a temporary doorstop. You are safe, annoyed, and entitled to a very specific complaint about the induction brochure.", tactic: "You entered a repair job without the missing instructions or a second pair of hands.", ally: "Registrar Sui opens the inspection hatch at noon. Temporary really does mean temporary." },
]);
export function endingById(id) { return ENDINGS.find(ending => ending.id === id) || null; }
export function incomingEnding(search) {
  const values = new URLSearchParams(search).getAll("ending");
  return values.length === 1 ? endingById(values[0]) : null;
}
const option = (label, consequence) => ({ label, consequence });
export const SCENES = [
  { title: "An oath before breakfast", text: "At Quiet Bell Sect, Registrar Sui hands you a visitor sash and an oath. You have no cultivation skills. The brochure says beginners are welcome; the oath says the mountain may require you personally. What do you sign?", choices: [
    option("Swear to protect the sect, whatever it takes.", "The oath glows. Sui quietly moves your form from Visitors to Possible Infrastructure."),
    option("Promise one day of help, with no blood vows.", "Sui stamps a one-day limit. Heaven dislikes footnotes, which is not the same as being able to ignore them."),
    option("Ask for the visitor terms and the exit route.", "Sui draws a path to the gate. It is refreshingly possible to be sincere without becoming load-bearing."),
  ] },
  { title: "The forbidden manual", text: "A book in the induction hall is chained shut: DO NOT READ — BACK MOUNTAIN WARD. A loose page says the sword is a latch, not a weapon. Master Wen is unavailable for the next seven ominous minutes.", choices: [
    option("Read the repair diagram; knowledge may prevent harm.", "You learn the ward needs a closed circuit and a witness. The forbidden knowledge turns out to include excellent labeling."),
    option("Take the sealed book to Master Wen.", "You carry the evidence without breaking the seal. A chain of custody is less glamorous than a spirit chain, but often more useful."),
    option("Leave the book and copy the visitor evacuation map.", "You trace a route that stays outside the ward. The map makes no promises about your spiritual potential, only the location of lunch."),
  ] },
  { title: "The stranger at the steps", text: "An injured courier named Ren sits below the hall. Their delivery token bears the back-mountain seal. They ask for water and say the mountain is opening, not attacking. Helping need not mean believing every word.", choices: [
    option("Bandage Ren and ask them to stay as a witness.", "Ren agrees. You have acquired a second pair of hands, not a sworn soulmate; everyone is relieved."),
    option("Call Registrar Sui for supervised help.", "Sui brings the infirmary staff and agrees to witness anything properly explained. Caution has not prevented kindness."),
    option("Leave water and alert the infirmary while keeping moving.", "Ren is cared for, but will not be beside you at the ward. You have not abandoned them; you have declined to become the entire emergency service."),
  ] },
  { title: "An explanation with missing subjects", text: "Master Wen says, “Never enter the back mountain.” Behind him is a freshly swept footpath. He admits the old keeper retired and the sword has been searching for a replacement. Apparently the sect called this a staffing issue.", choices: [
    option("Obey, but require Wen to take responsibility for the ward.", "Wen accepts the job in front of Sui. A mysterious master becomes considerably less mysterious when assigned an action item."),
    option("Investigate the footpath and find the damaged latch.", "You find an inspection platform, not a forbidden romance. The damaged ward still needs actual repair, which is harder to market."),
    option("Ask why a forbidden mountain has a maintained footpath.", "Wen admits visitors can withdraw at the outer gate. You obtain a signed exit slip. Destiny has encountered a receipt."),
  ] },
  { title: "The sword would like an answer", text: "The ward cracks. A sword rises from its socket and offers you the title of Keeper. The outer gate remains reachable. You can hold the latch, remove it from the mountain, or decline the appointment.", choices: [
    option("Stay on the platform and close the ward circuit.", "You put your hands on the latch. The mountain now has to respond to the preparations you actually made."),
    option("Carry the sword outside so nobody here is trapped.", "You cross the ward with its latch. This protects the platform immediately; ownership is about to become everyone’s favorite subject."),
    option("Decline the sword and take the outer gate.", "You walk toward the signed boundary. The difference between an invitation and an obligation is now very relevant."),
  ] },
];
export function sceneAt(index, trail) {
  if (trail.length !== index || !SCENES[index]) throw new Error("Invalid scene state");
  const callbacks = [];
  if (index === 2) callbacks.push([
    "Your unlimited oath warms as Ren approaches. It recognizes a potential obligation before you recognize a person.",
    "Your one-day stamp stays cool. You can offer help without promising a lifetime.",
    "The exit map Sui gave you shows the infirmary beside the gate. Practical questions have already helped someone.",
  ][trail[0]]);
  if (index === 3) callbacks.push([
    "The diagram you read identifies the footpath as a repair approach; Wen cannot plausibly call it ornamental.",
    "The sealed manual in your hands makes Wen explain why the ward instructions were withheld.",
    "Your copied map marks a safe outer route. You can question Wen without volunteering to enter.",
  ][trail[1]], [
    "Ren stands beside you with a fresh bandage and offers to witness the repair.",
    "Sui arrives from the infirmary and insists on hearing the full explanation.",
    "An infirmary bell confirms Ren is safe. You will face the ward without a nearby witness.",
  ][trail[2]]);
  if (index === 4) callbacks.push([
    "Your unlimited oath is glowing like a signature line.",
    "The one-day limit on your oath is still legible.",
    "Your visitor sash has no keeper’s oath attached.",
  ][trail[0]], [
    "Wen is beside the socket, publicly responsible for what happens next.",
    "Your investigation has put you on the inspection platform.",
    "Wen’s signed exit slip is in your pocket.",
  ][trail[3]], trail[1] === 0 ? "You remember the diagram: a circuit and a witness, not brute cultivation power." : "You do not have the repair diagram; holding the latch alone is not a complete plan.");
  return { ...SCENES[index], callbacks };
}
// Explicit first-match precedence, not scores: sword removal; unlimited oath;
// prepared/authorized exit; supervised responsibility; witnessed repair; containment.
// No ties: exactly one ordered branch wins, including every fallback.
export function resolveRun(trail) {
  if (trail.length !== 5 || trail.some(n => !Number.isInteger(n) || n < 0 || n > 2)) throw new Error("Five valid decisions required");
  const [oath, manual, stranger, master, crisis] = trail;
  let id, cause;
  if (crisis === 1) { id = "three-realms"; cause = "You carried the latch beyond the ward. Removing the sword takes precedence over its offers and every promise: all three realms detect the missing seal."; }
  else if (oath === 0) { id = "heavenly-vow"; cause = "Your first unlimited oath lets the sword bind you even when you decline or try to repair it. The promise, not your cultivation skill, authorizes the appointment."; }
  else if (crisis === 2 && (oath === 2 || manual === 2 || master === 2)) { id = "before-lunch"; cause = `You declined the sword using ${master === 2 ? "Wen’s signed exit slip" : oath === 2 ? "the visitor terms you requested at arrival" : "the evacuation route you copied"}. With no unlimited oath, the boundary lets you leave.`; }
  else if (master === 0) { id = "masters-favorite"; cause = `You made Wen responsible before ${crisis === 2 ? "trying to depart without an exit arrangement" : "touching the latch"}. He handles the ward rather than letting it recruit you.`; }
  else if (crisis === 0 && manual === 0 && stranger !== 2) { id = "sect-savior"; cause = `The forbidden diagram supplies the circuit; ${stranger === 0 ? "Ren, whom you bandaged," : "Sui, whom you called for supervised help,"} supplies the witness. Together those preparations let you repair the ward without cultivation.`; }
  else { id = "back-mountain"; cause = crisis === 2 ? "You declined the sword but had arranged neither visitor terms, an evacuation map, nor an exit slip. The ward holds you safely until its inspection hatch opens." : `You attempted the repair without ${manual !== 0 ? "the diagram" : "a nearby witness"}. The incomplete circuit invokes temporary containment instead of a keeper appointment.`; }
  return { ...endingById(id), cause, ally: id === "sect-savior" ? `${stranger === 0 ? "Ren" : "Registrar Sui"} steadies the ward while you close its broken circuit.` : endingById(id).ally };
}
