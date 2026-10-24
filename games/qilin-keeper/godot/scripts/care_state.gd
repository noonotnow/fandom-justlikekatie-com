extends RefCounted
## Session-only needs. Units are 0..100; all rates use active simulation seconds.
## Hungry grows, energy falls slowly while awake, and interest returns gradually.
## No wall-clock timestamps, storage, hygiene decay, or affection score.

const INITIAL_HUNGER := 58.0
const INITIAL_ENERGY := 78.0
const INITIAL_INTEREST := 72.0
const FULL := 12.0
const HUNGRY := 45.0
const TIRED := 24.0
const SATISFIED := 18.0
const HUNGER_PER_SECOND := 0.08
const AWAKE_ENERGY_PER_SECOND := 0.025
const INTEREST_PER_SECOND := 0.25
const BITE_RELIEF := 20.0
const BOOP_ENERGY := 6.0
const BOOP_INTEREST := 6.0
const SLEEP_ENERGY_PER_SECOND := 1.8
const SLEEP_INTEREST_PER_SECOND := 0.6

var hunger := INITIAL_HUNGER:
	set(value): hunger = clampf(value,0,100)
var energy := INITIAL_ENERGY:
	set(value): energy = clampf(value,0,100)
var interest := INITIAL_INTEREST:
	set(value): interest = clampf(value,0,100)

func reset() -> void:
	hunger = INITIAL_HUNGER
	energy = INITIAL_ENERGY
	interest = INITIAL_INTEREST

func wants_food() -> bool:
	return hunger > FULL

func tired() -> bool:
	return energy <= TIRED

func wants_play() -> bool:
	return not tired() and interest > SATISFIED

func awake(seconds: float) -> void:
	var dt := maxf(0,seconds)
	hunger += HUNGER_PER_SECOND*dt
	energy -= AWAKE_ENERGY_PER_SECOND*dt
	interest += INTEREST_PER_SECOND*dt

func sleep_for(seconds: float) -> void:
	var dt := maxf(0,seconds)
	energy += SLEEP_ENERGY_PER_SECOND*dt
	interest += SLEEP_INTEREST_PER_SECOND*dt

func eat_bite() -> void:
	hunger -= BITE_RELIEF

func bat_ball() -> void:
	energy -= BOOP_ENERGY
	interest -= BOOP_INTEREST

func play_response() -> String:
	if tired():
		return "A slow blink. It watches the ball, but its paws want a nap. N: rest; L: put away."
	return "A happy huff. Enough ball for now; it watches without chasing. Cuddles are still welcome."

func snapshot() -> Dictionary:
	return {"hunger":hunger,"energy":energy,"interest":interest}
