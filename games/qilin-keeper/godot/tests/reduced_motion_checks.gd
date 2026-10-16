extends SceneTree
## Visual preference must never substitute for care or erase saved layers.

const PREFS := "user://reduced-motion-checks.cfg"
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func new_game():
	var game = load("res://scenes/courtyard.tscn").instantiate()
	game.preferences_path = PREFS
	game.keepsake_save_path = "user://reduced-motion-checks-keepsakes.json"
	root.add_child(game)
	game.set_process(false)
	game.muted = true
	# Do not let frame processing change fixtures between manual simulation steps.
	for node in [game.bowl,game.cleanup,game.baby_mess,game.grooming,game.bathing]:
		node.set_process(false)
	return game

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	DirAccess.remove_absolute(PREFS)
	var game = new_game()
	check(not game.reduced_motion,"Existing players start with full motion.")
	game.motion_button.pressed.emit()
	check(game.reduced_motion and game.motion_button.button_pressed and game.motion_button.text.ends_with("On"),"Visible control enables reduced motion with matching feedback.")
	var reopened = new_game()
	check(reopened.reduced_motion and reopened.motion_button.button_pressed,"Reduced motion survives reopening the game.")
	game.reset_scene()
	check(game.reduced_motion,"Reset care does not reset accessibility.")
	reopened.motion_button.pressed.emit()
	var full_motion = new_game()
	check(not full_motion.reduced_motion,"Turning the preference off also persists.")
	reopened.free()
	full_motion.free()

	var baseline: Array = []
	for reduced in [false,true]:
		game.reduced_motion = reduced
		game.reset_scene()
		game.baby_mess.mark_dirty()
		game.cleanup.spawn(game.NEAR_BOWL)
		game.grooming.tufts[0].ruffle = 0.35
		game.cup.water = 2
		game.bowl.eat_one()
		var dirt: Array = game.baby_mess.spots.duplicate(true)
		var floor_mess: Array = game.cleanup.patches.duplicate(true)
		var foods: Array = game.cleanup.foods.duplicate(true)
		var tufts: Array = game.grooming.tufts.duplicate(true)
		var bath: Array = game.bathing.patches.duplicate(true)
		var stickers: Dictionary = game.album.store.placed.duplicate(true)
		var pieces: int = game.bowl.pieces
		var bowl_at: Vector2 = game.bowl.position
		var layers: Array = [game.bowl,game.cleanup,game.baby_mess,game.grooming,game.bathing]
		for interrupt in ["finish","skip","pause","switch"]:
			for i in layers.size():
				layers[i].visible = i%2 == 0
				layers[i].set_process(i%2 != 0)
			game.baby.position = game.HOME+Vector2(3,-2)
			game.baby.scale = Vector2(0.61,0.63)
			game.baby.rotation = 0.013
			game.baby.modulate = Color(0.9,0.8,0.7,0.85)
			var at: Vector2 = game.baby.position
			var scale_before: Vector2 = game.baby.scale
			var color: Color = game.baby.modulate
			game.toggle_nap()
			game.play.key_contact = true
			game._process(4)
			check(game.play.settling == 0 and not game.play.sleeping,"Motion setting cannot skip the blanket requirement.")
			game.play.tuck()
			game._process(2.9)
			check(not game.play.sleeping,"Motion setting cannot shorten the three-second settling requirement.")
			game._process(0.1)
			check(game.play.sleeping,"Both settings settle with the same care contact.")
			game.toggle_nap()
			var duration: float = game.play.wake_duration
			check(is_equal_approx(duration,0.35 if reduced else 1.8),"Wake visual duration reflects the preference.")
			game._process(duration*0.3)
			check(game.play.waking and game.play.wake_body.visible,"Both settings show the wake artwork rather than skipping it.")
			check(not game.baby_mess.visible,"Layers remain tucked away throughout waking.")
			match interrupt:
				"finish":
					game._process(duration*0.71)
				"skip":
					game.toggle_nap()
				"pause":
					game.toggle_pause()
					var before: float = game.play.wake_time
					game._process(10)
					check(game.play.wake_time == before,"Pause freezes either wake duration.")
					game.toggle_pause()
					game._process(duration)
				"switch":
					# Changing the preference mid-wake must not rewind its transition.
					game.reduced_motion = not reduced
					check(game.play.wake_duration == duration,"In-flight wake keeps its captured duration.")
					game.toggle_toy()
					game.play.stop()
					game.reduced_motion = reduced
			check(not game.play.active() and game.state == "idle","Both wake settings restore standing care after "+interrupt+".")
			check(game.baby.position.is_equal_approx(at) and game.baby.scale.is_equal_approx(scale_before) and is_equal_approx(game.baby.rotation,0.013) and game.baby.modulate == color,"Both settings restore the saved body transform and opacity.")
			for i in layers.size():
				check(layers[i].visible == (i%2 == 0) and layers[i].is_processing() == (i%2 != 0),"Both settings restore each saved visible/hidden and processing layer.")
			check(game.baby_mess.spots == dirt and game.cleanup.patches == floor_mess and game.cleanup.foods == foods,"Wake never changes body or floor cleanup state.")
			check(game.grooming.tufts == tufts and game.bathing.patches == bath,"Wake preserves grooming and bath progress.")
			check(game.bowl.pieces == pieces and game.bowl.position == bowl_at and game.cup.water == 2 and game.album.store.placed == stickers,"Wake preserves food, water, placement and keepsakes.")
			game.play.advance(10)
			check(game.state == "idle" and not game.play.wake_body.visible,"No late wake callback can overwrite restored care.")

		# Compare the whole semantic trace, not just the final care state.
		var trace: Array = []
		game.reset_scene()
		game.start_feeding()
		for delta in [0.2,0.34,0.02,0.45,0.6,0.5,0.6,0.5,0.6,0.5]:
			game._process(delta)
			trace.append([game.state,game.bowl.pieces,game.bite_taken,game.status])
		game.reset_scene()
		game.start_drinking()
		for delta in [0.2,0.7,0.1,0.7,0.75,0.6]:
			game._process(delta)
			trace.append([game.state,game.cup.water,game.sips_taken,game.cup.completed,game.status])
		game.reset_scene()
		game.start_cuddle()
		game.released_cuddle = true
		for delta in [0.2,0.2,1.6,2.9,0.2]:
			game._process(delta)
			trace.append([game.state,game.huffed,game.status])
		game.reset_scene()
		game.raise_paw()
		for delta in [0.2,1.5,0.24,0.7]:
			game._process(delta)
			trace.append([game.state,game.bowl.pieces,game.cleanup.patches.size(),game.status])
		if not reduced:
			baseline = trace
		else:
			check(trace == baseline,"Feeding, sipping, affection and swatting outcomes and timing are identical.")

	# Save failure is visible, but never prevents this session's preference.
	game.preferences_path = "user://missing-motion-directory/preferences.cfg"
	game.toggle_reduced_motion()
	check(not game.preferences_label.text.is_empty(),"Unavailable local storage produces visible feedback.")
	game.free()
	DirAccess.remove_absolute(PREFS)
	DirAccess.remove_absolute("user://reduced-motion-checks-keepsakes.json")
	if failures.is_empty():
		print("Qilin reduced-motion checks: PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL: "+failure)
		quit(1)
