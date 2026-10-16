extends Node2D
## First playable: read the gesture, move the prop, preserve the affection.
## There are intentionally no hunger meters, care scores, or challenge timers.

const BowlScript = preload("res://scripts/bowl.gd")
const CupScript = preload("res://scripts/cup.gd")
const PawScript = preload("res://scripts/paw.gd")
const ShoulderScript = preload("res://scripts/shoulder.gd")
const CleanupScript = preload("res://scripts/spill_cleanup.gd")
const BabyCleanupScript = preload("res://scripts/baby_cleanup.gd")
const SurfacesScript = preload("res://scripts/care_surfaces.gd")
const GroomingScript = preload("res://scripts/grooming.gd")
const BathingScript = preload("res://scripts/bathing.gd")
const FlightScript = preload("res://scripts/cloud_flight.gd")
const CaseScript = preload("res://scripts/cassette_case.gd")
const RestPlayScript = preload("res://scripts/rest_play.gd")
const CareStateScript = preload("res://scripts/care_state.gd")
const CareSignalsScript = preload("res://scripts/care_signals.gd")
const HandScript = preload("res://scripts/hand.gd")
const SnackScript = preload("res://scripts/snack.gd")
const IDLE_ART = preload("res://assets/qilin.png")
const REST_ART = preload("res://assets/qilin-rest.png")
const BITE_ART = preload("res://assets/qilin-bite.png")
const GLANCE_LEFT = preload("res://assets/qilin-glance-left.png")
const GLANCE_RIGHT = preload("res://assets/qilin-glance-right.png")
const BACKDROP = preload("res://assets/courtyard.jpg")
const CLINK = preload("res://assets/clink.wav")
const HUFF = preload("res://assets/huff.wav")
const HOME := Vector2(690, 437)
const PAW_HOME := Vector2(456, 557)
const ARM_HOME := Vector2(292,750) - Vector2(512,512)
const SAFE_BOWL := Vector2(1040, 662)
const NEAR_BOWL := Vector2(465, 657)
const CHEEK := Vector2(579, 460)
const MOUTH := Vector2(542, 492)

var baby: Sprite2D
var paw: Node2D
var bowl: Node2D
var cup: Node2D
var cup_dragging := false
var drink_start := Vector2.ZERO
var sips_taken := 0
var glance_active := false
var hand: Node2D
var snack: Node2D
var cleanup: Node2D
var baby_mess: Node2D
var care_surfaces: RefCounted
var grooming: Node2D
var bathing: Node2D
var flight: Node2D
var flight_button: Button
var album: Node2D
var case_button: Button
var play: Node2D
var nap_button: Button
var toy_button: Button
var keepsake_save_path := "user://qilin-keepsakes.json"
var bite_taken := false
var care = CareStateScript.new()
var care_signals = CareSignalsScript.new()
var feeding_bites := 0
var feeding_end := INF
var focus_suspended := false
var hud: Control
var status_label: Label
var helper: Label
var mute_button: Button
var pause_button: Button
var sound: AudioStreamPlayer
var state := "idle"
var state_time := 0.0
var elapsed := 0.0
var next_gesture := 6.0
var high_five := false
var swat_done := false
var dragging := false
var drag_offset := Vector2.ZERO
var mouse_held := false
var cuddle_held := false
var released_cuddle := false
var huffed := false
var paused := false
var muted := false
var ui_alpha := 1.0
var status := "Lift the moonpear bowl to its mouth to feed it. Or press F."
var petals: Array[Vector3] = []
var reduced_motion := false
var preferences_path := "user://qilin-preferences.cfg"
var preferences_error := ""
var preferences_browser_status := ""
var motion_button: Button
var preferences_label: Label

func _ready() -> void:
	load_preferences()
	for i in range(18):
		petals.append(Vector3(randf_range(0,1280),randf_range(110,740),randf_range(0.3,1.0)))
	baby = Sprite2D.new()
	baby.texture = IDLE_ART
	baby.position = HOME
	baby.scale = Vector2.ONE * 0.62
	baby.z_index = 3
	add_child(baby)
	paw = PawScript.new()
	paw.position = ARM_HOME
	paw.rotation = -0.45
	baby.add_child(paw)
	care_surfaces = SurfacesScript.new()
	care_surfaces.body = baby
	care_surfaces.paw_art = paw.get_child(0)
	var shoulder = ShoulderScript.new()
	shoulder.limb = paw
	shoulder.show_behind_parent = true
	baby.add_child(shoulder)
	bowl = BowlScript.new()
	bowl.position = NEAR_BOWL
	add_child(bowl)
	cup = CupScript.new()
	cup.position = cup.HOME
	cup.z_index = 5
	add_child(cup)
	baby_mess = BabyCleanupScript.new()
	baby_mess.body = baby
	baby_mess.paw = paw
	baby_mess.surfaces = care_surfaces
	baby_mess.z_index = 4
	add_child(baby_mess)
	cleanup = CleanupScript.new()
	cleanup.baby_mess = baby_mess
	cleanup.surfaces = care_surfaces
	cleanup.z_index = 2
	add_child(cleanup)
	grooming = GroomingScript.new()
	grooming.body = baby
	grooming.surfaces = care_surfaces
	grooming.z_index = 4
	add_child(grooming)
	bathing = BathingScript.new()
	bathing.body = baby
	bathing.surfaces = care_surfaces
	bathing.z_index = 5
	add_child(bathing)
	bowl.z_index = 3
	snack = SnackScript.new()
	snack.visible = false
	snack.z_index = 5
	add_child(snack)
	hand = HandScript.new()
	hand.z_index = 6
	add_child(hand)
	sound = AudioStreamPlayer.new()
	sound.volume_db = -12
	add_child(sound)
	build_hud()
	flight = FlightScript.new()
	flight.z_index = 2
	add_child(flight)
	var case_layer := CanvasLayer.new()
	case_layer.layer = 20
	add_child(case_layer)
	album = CaseScript.new()
	album.host = self
	album.save_path = keepsake_save_path
	case_layer.add_child(album)
	play = RestPlayScript.new()
	play.z_index = 2
	add_child(play)
	# Browser preview can open directly on the requested play activity.
	# Native Godot still begins with care; Y or the visible button starts flight.
	if OS.has_feature("web") and JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('activity')") == "cloud":
		toggle_cloud()
	queue_redraw()

func make_label(text: String, at: Vector2, size: int, color: Color, parent: Node) -> Label:
	var label := Label.new()
	label.text = text
	label.position = at
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color",color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label

func make_button(text: String, at: Vector2, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.position = at
	button.size = Vector2(93,38)
	button.add_theme_font_size_override("font_size",17)
	button.add_theme_color_override("font_color",Color("#382146"))
	var box := StyleBoxFlat.new()
	box.bg_color = Color("#f9eddc")
	box.border_color = Color("#62417f")
	box.set_border_width_all(2)
	box.set_corner_radius_all(12)
	button.add_theme_stylebox_override("normal",box)
	var hover_box := box.duplicate() as StyleBoxFlat
	hover_box.bg_color = Color("#a2f0d1")
	button.add_theme_stylebox_override("hover",hover_box)
	button.pressed.connect(callback)
	hud.add_child(button)
	return button

func build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(hud)
	make_label("SMALL PAWS. BIG FEELINGS.",Vector2(40,24),29,Color("#fff3c7"),hud)
	make_label("QILIN KEEPER  /  THE FIRST AFTERNOON",Vector2(42,61),15,Color("#edcef4"),hud)
	case_button = make_button("Case / K",Vector2(616,27),toggle_case)
	case_button.size.x = 154
	case_button.focus_mode = Control.FOCUS_NONE
	flight_button = make_button("Cloud ride / Y",Vector2(790,27),toggle_cloud)
	flight_button.size.x = 190
	# The ride button must not steal Space from the existing high-five controls.
	flight_button.focus_mode = Control.FOCUS_NONE
	mute_button = make_button("Sound on",Vector2(1000,27),toggle_mute)
	pause_button = make_button("Pause",Vector2(1101,27),toggle_pause)
	nap_button = make_button("Nap / N",Vector2(48,110),toggle_nap)
	nap_button.size.x = 155
	nap_button.focus_mode = Control.FOCUS_NONE
	toy_button = make_button("Ball / L",Vector2(218,110),toggle_toy)
	toy_button.size.x = 155
	toy_button.focus_mode = Control.FOCUS_NONE
	motion_button = make_button("Reduced motion: On" if reduced_motion else "Reduced motion: Off",Vector2(390,110),toggle_reduced_motion)
	motion_button.size.x = 245
	motion_button.toggle_mode = true
	motion_button.button_pressed = reduced_motion
	motion_button.tooltip_text = "Shorter, gentler care and wake-up motion. Care and affection stay the same. Saved on this device."
	preferences_label = make_label(preferences_error,Vector2(390,153),16,Color("#fff3c7"),hud)
	status_label = make_label(status,Vector2(46,716),23,Color("#352044"),hud)
	helper = make_label("Bowl to mouth: feed / F. Paw: high-five. Hold cheek: affection. Empty bowl: refill.",Vector2(46,752),17,Color("#6f507b"),hud)

func _process(delta: float) -> void:
	update_preferences_storage_feedback()
	update_motion_browser_probe()
	update_care_browser_probe()
	if album.opened:
		return
	if paused or focus_suspended:
		return
	if play.active():
		elapsed += delta
		play.advance(delta)
		queue_redraw()
		return
	if flight.active:
		elapsed += delta
		flight.advance(delta)
		ui_alpha = move_toward(ui_alpha,1,delta*3)
		hud.visible = true
		hud.modulate.a = ui_alpha
		status_label.text = status
		helper.text = "Arrows or hold-drag: steer. Land / Y / Esc: care. Case / K: keepsake stickers."
		queue_redraw()
		return
	if state != "feeding":
		care.awake(delta)
	if not cleanup.feedback.is_empty():
		status = cleanup.feedback
		cleanup.feedback = ""
	if cleanup.completed:
		next_gesture = elapsed + 8.0
		cleanup.completed = false
	if not grooming.feedback.is_empty():
		status = grooming.feedback
		grooming.feedback = ""
	if grooming.huff_requested:
		play_sound(HUFF)
		grooming.huff_requested = false
		next_gesture = elapsed + 12
	if not bathing.feedback.is_empty():
		status = bathing.feedback
		bathing.feedback = ""
	if bathing.huff_requested:
		play_sound(HUFF)
		bathing.huff_requested = false
		next_gesture = elapsed + 12
	helper.text = bathing.hint() if bathing.selected >= 0 else (grooming.hint() if grooming.selected else cleanup.hint()+" T: brush. S/E/D: bath.")
	elapsed += delta
	state_time += delta
	bowl.hover = bowl.contains(get_global_mouse_position())
	cup.hover = cup.contains(get_global_mouse_position())
	cup.queue_redraw()
	glance_active = false
	var quiet: bool = state == "cuddle" or (grooming.selected and grooming.quiet_time > 0) or (bathing.selected >= 0 and bathing.quiet_time > 0)
	ui_alpha = move_toward(ui_alpha,0.0 if quiet else 1.0,delta * 2.0)
	hud.modulate.a = ui_alpha
	hud.visible = ui_alpha > 0.02
	status_label.text = status
	var visual_delta := delta * (4.0 if reduced_motion else 1.0)
	var motion_amount := 0.15 if reduced_motion else 1.0
	baby.position = baby.position.lerp(HOME + Vector2(-18,12) if quiet else HOME, minf(visual_delta*3,1))
	var breathe := sin(elapsed * (1.5 if quiet else 2.0)) * 0.006 * motion_amount
	baby.scale = Vector2(0.62 + breathe,0.62 - breathe)
	baby.rotation = lerp_angle(baby.rotation,-0.045 if quiet else 0.008*sin(elapsed*0.8)*motion_amount,minf(visual_delta*3,1))
	match state:
		"idle":
			baby.texture = REST_ART if baby_mess.recent_contact > 0 or grooming.content > 0 or bathing.content > 0 or quiet else IDLE_ART
			# A repeated, non-demanding preference tell, suppressed during care/affection.
			glance_active = cup.water > 0 and fmod(elapsed,9.0) < 1.8 and not dragging and not cup_dragging and not cleanup.active() and not grooming.selected and bathing.selected < 0 and baby.texture == IDLE_ART
			if glance_active:
				baby.texture = GLANCE_LEFT if cup.position.x < MOUTH.x else GLANCE_RIGHT
			if bathing.startled > 0:
				baby.texture = IDLE_ART
				baby.rotation += sin(bathing.startled*14)*0.012*motion_amount
			if grooming.offended > 0:
				baby.texture = IDLE_ART
				baby.rotation = lerp_angle(baby.rotation,0.025,minf(visual_delta*6,1))
			paw.amount = move_toward(paw.amount,0,delta*4)
			paw.rotation = lerp_angle(paw.rotation,-0.45,minf(delta*5,1))
			care_signals.idle(self,delta)
			if elapsed >= next_gesture and not care.tired() and not dragging and not cup_dragging and not cleanup.has_mess() and not cleanup.active() and not grooming.selected and bathing.selected < 0:
				raise_paw()
		"paw":
			paw.amount = move_toward(paw.amount,1,delta*5)
			paw.position = ARM_HOME
			paw.rotation = lerp_angle(paw.rotation,0.03*sin(state_time*3),minf(delta*6,1))
			if state_time >= 1.65:
				state = "swipe"
				state_time = 0
				swat_done = false
		"swipe":
			var danger: bool = bowl.position.distance_to(PAW_HOME) < 255.0 and bowl.full
			var swipe_amount := sin(minf(state_time/0.7,1.0)*PI)
			paw.rotation = swipe_amount * (-0.8 if danger else 0.22)
			if state_time >= 0.23 and not swat_done:
				swat_done = true
				if danger:
					bowl.spill()
					cleanup.spawn(bowl.position)
					play_sound(CLINK)
					status = "Oh. We should really clean that up. Baby AND floor."
				elif high_five:
					status = "Bowl safe. High-five intact. An unfortunate development."
				else:
					status = "Nothing within swatting distance. Still a perfectly good paw."
				if cup.water > 0 and cup.position.distance_to(PAW_HOME) < 135:
					cup.spill()
					cleanup.spawn_water(cup.position)
					play_sound(CLINK)
					status = cleanup.feedback
			if state_time >= 0.85:
				state = "idle"
				next_gesture = elapsed + 10.0
		"cuddle":
			paw.amount = move_toward(paw.amount,0,visual_delta*2)
			paw.rotation = lerp_angle(paw.rotation,-0.45,minf(visual_delta*2,1))
			if state_time >= 0.35:
				baby.texture = REST_ART
			if state_time >= 1.9 and not huffed:
				huffed = true
				play_sound(HUFF)
			# At least five seconds for the relaxed paw, settled weight, and full huff.
			# Holding longer is always welcome. No demands run during this state.
			if released_cuddle and state_time >= 5.0:
				end_cuddle()
		"feeding":
			paw.rotation = lerp_angle(paw.rotation,-0.25,minf(visual_delta*4,1))
			advance_feeding(delta)
			var bite_time := fmod(state_time,1.0)
			var travel := clampf(bite_time / (0.15 if reduced_motion else 0.55),0,1)
			snack.position = (bowl.position+Vector2(0,-40)).lerp(MOUTH,travel)
			snack.position.y -= sin(travel*PI)*35*motion_amount
			snack.scale = Vector2.ONE * (1.0 - travel*0.6)
			bite_taken = feeding_bites > int(floor(state_time))
			snack.visible = state == "feeding" and not bite_taken
			# Open for the approaching bite; visibly close and chew afterward.
			if state == "feeding" and bite_time >= 0.22 and bite_time < 0.65:
				baby.texture = BITE_ART
			else:
				baby.texture = IDLE_ART
			if bite_taken:
				baby.scale.y *= 1.0 + sin(state_time*26)*0.012*motion_amount
		"drinking":
			paw.amount = move_toward(paw.amount,0,delta*3)
			paw.rotation = lerp_angle(paw.rotation,-0.45,minf(delta*5,1))
			var snout := baby.to_global((MOUTH-HOME)/0.62)
			cup.position = drink_start.lerp(snout+Vector2(0,26),clampf(state_time/(0.15 if reduced_motion else 0.55),0,1))
			cup.sip_phase = state_time*17
			cup.rotation = -0.09-0.04*sin(cup.sip_phase)*motion_amount if state_time > 0.55 else 0.0
			baby.texture = REST_ART if state_time > 0.55 else IDLE_ART
			if state_time > 0.55:
				baby.scale.y *= 1 + sin(cup.sip_phase)*0.012*motion_amount
			for i in 3:
				if state_time >= 0.95+i*0.75 and sips_taken == i:
					cup.sip()
					sips_taken += 1
			if state_time >= 3.0:
				cup.completed = true
				cup.position = cup.HOME
				cup.rotation = 0
				state = "idle"
				state_time = 0
				baby.texture = REST_ART
				status = "Sips finished. Favorite cup empty. Click it to refill; affection is always welcome."
				next_gesture = elapsed + 12
				play_sound(HUFF)
	paw.position = ARM_HOME
	if state == "cuddle":
		hand.position = CHEEK + Vector2(-9,29)
		hand.amount = move_toward(hand.amount,1,visual_delta*2)
	elif high_five and (state == "paw" or state == "swipe"):
		hand.position = paw.palm_position() + Vector2(-15,-10)
		hand.amount = move_toward(hand.amount,1,delta*6)
	else:
		hand.amount = move_toward(hand.amount,0,delta*3)
	status_label.text = status
	queue_redraw()

func advance_feeding(delta: float) -> void:
	# Split at real bite events, so a slow frame cannot lose or duplicate bites
	# and hunger grows for exactly the same duration at any frame rate.
	var cursor := state_time-delta
	while is_inf(feeding_end) and feeding_bites+0.55 <= state_time+0.000001:
		var at := feeding_bites+0.55
		care.awake(maxf(0,at-cursor))
		cursor = at
		if bowl.full and care.wants_food():
			bowl.eat_one()
			care.eat_bite()
			feeding_bites += 1
			status = "Nom. %d moonpear bites left." % bowl.pieces
		else:
			feeding_end = ceilf(at)
		if not bowl.full or not care.wants_food():
			feeding_end = float(feeding_bites)
	care.awake(maxf(0,state_time-cursor))
	if state_time+0.000001 >= feeding_end:
		state = "idle"
		snack.hide()
		status = "Moonpear accepted. Click the empty bowl to refill." if not bowl.full else "A full tummy and a contented blink. Saving the rest for later."
		next_gesture = elapsed+12
		play_sound(HUFF)

func toggle_cloud() -> void:
	if play.active():
		status = "Finish the nap or put the ball away before flying."
		return
	if album.opened:
		return
	if flight.active:
		flight.land()
	else:
		flight.start()

func toggle_case() -> void:
	if album.opened:
		album.close_case()
	else:
		album.open_case()

func toggle_nap() -> void:
	if paused or album.opened:
		return
	if play.mode == "nap":
		play.wake()
	else:
		play.start("nap")

func toggle_toy() -> void:
	if paused or album.opened:
		return
	if play.mode == "toy":
		play.stop()
	else:
		play.start("toy")

func raise_paw() -> void:
	if state == "cuddle" or state == "feeding" or state == "drinking":
		return
	grooming.cancel()
	bathing.cancel()
	state = "paw"
	state_time = 0
	high_five = false
	paw.position = ARM_HOME
	status = "That looks like a high-five. What is within reach?"

func meet_paw() -> void:
	if state == "idle":
		raise_paw()
	high_five = true
	status = "A lovely high-five. A suspiciously nearby bowl."

func start_cuddle() -> void:
	if state == "feeding":
		return
	if state == "cuddle":
		released_cuddle = false
		return
	cancel_cup()
	state = "cuddle"
	state_time = 0
	released_cuddle = false
	huffed = false
	cleanup.cancel_interaction()
	grooming.cancel()
	bathing.cancel()
	status = ""
	dragging = false

func start_feeding() -> void:
	if paused or focus_suspended or flight.active or play.active() or state == "cuddle" or state == "feeding" or not bowl.full:
		return
	cancel_cup()
	if not care.wants_food():
		cleanup.cancel_interaction()
		grooming.cancel()
		bathing.cancel()
		state = "idle"
		dragging = false
		high_five = false
		bowl.position = SAFE_BOWL
		care_signals.refusal = 1.8
		status = "A gentle lean away. Tummy full; moonpear saved for later. Affection still welcome."
		next_gesture = elapsed+12
		return
	state = "feeding"
	state_time = 0.0
	bite_taken = false
	feeding_bites = 0
	feeding_end = INF
	high_five = false
	dragging = false
	cleanup.cancel_interaction()
	grooming.cancel()
	bathing.cancel()
	baby.texture = IDLE_ART
	bowl.position = Vector2(501,570)
	status = "Yes. That moonpear. More of that moonpear."
	snack.visible = true

func equip_brush() -> void:
	if paused or state == "feeding" or state == "cuddle":
		return
	cancel_cup()
	cleanup.cancel_interaction()
	bathing.cancel()
	dragging = false
	state = "idle"
	state_time = 0
	high_five = false
	next_gesture = elapsed + 12
	grooming.equip()

func cancel_cup() -> void:
	if cup_dragging or state == "drinking":
		cup.position = cup.HOME
		cup.rotation = 0
		cup.sip_phase = 0
	cup_dragging = false
	if state == "drinking":
		state = "idle"
		state_time = 0
		baby.texture = IDLE_ART
		next_gesture = elapsed + 12
		status = "Cup set down. Any unfinished water stays in the cup."

func start_drinking() -> void:
	if paused or state == "feeding" or state == "cuddle" or state == "drinking":
		return
	cancel_cup()
	cleanup.cancel_interaction()
	cleanup.feedback = ""
	grooming.cancel()
	grooming.feedback = ""
	bathing.cancel()
	bathing.feedback = ""
	dragging = false
	high_five = false
	if cup.water == 0:
		cup.refill()
		status = "Fresh water in its favorite moon cup. Lift it to the snout, or press J."
		return
	state = "drinking"
	state_time = 0
	sips_taken = 0
	drink_start = cup.position
	status = "Its moon cup. Little sips, at its own pace."

func finish_cup_drag() -> void:
	if not cup_dragging:
		return
	cup_dragging = false
	if cup.water > 0 and cup.position.distance_to(MOUTH) < 95:
		start_drinking()
	else:
		cup.position = cleanup.floor_point(cup.position,Vector2(45,32))
		status = "Moon cup set down. Lift it to the snout to offer water."

func equip_bath(kind: int) -> void:
	if paused or state == "feeding" or state == "cuddle":
		return
	cancel_cup()
	cleanup.cancel_interaction()
	grooming.cancel()
	dragging = false
	state = "idle"
	state_time = 0
	high_five = false
	next_gesture = elapsed + 12
	bathing.equip(kind)

func finish_bowl_drag() -> void:
	if not dragging:
		return
	dragging = false
	if bowl.full and bowl.position.distance_to(MOUTH) < 130.0:
		start_feeding()
	else:
		bowl.position.y = clampf(bowl.position.y,530,680)
		status = "Bowl relocated. It can eat if you lift it to its mouth."

func end_cuddle() -> void:
	state = "idle"
	state_time = 0
	baby.texture = IDLE_ART
	status = "Its favorite place to rest. Even after the spill."
	next_gesture = elapsed + 12.0

func handle_care_input_at(event: InputEvent, at: Vector2) -> bool:
	if paused or flight.active or state == "cuddle" or state == "feeding":
		return false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		# Resolve tray pickup before any selected tool consumes the mouse.
		if bathing.tray_at(at) >= 0 or grooming.tray_contains(at) or at.distance_to(cleanup.CLOTH_HOME) < 48 or at.distance_to(cleanup.MOP_HOME) < 50:
			cancel_cup()
			dragging = false
		if bathing.tray_at(at) >= 0:
			return bathing.handle_at(event,at)
		if grooming.tray_contains(at):
			return grooming.handle_at(event,at)
		if at.distance_to(cleanup.CLOTH_HOME) < 48 or at.distance_to(cleanup.MOP_HOME) < 50:
			grooming.cancel()
			bathing.cancel()
	if state == "drinking":
		return false
	return bathing.handle_at(event,at) or grooming.handle_at(event,at) or cleanup.handle_at(event,at)

func _input(event: InputEvent) -> void:
	# Capture an open case before GUI buttons or care shortcuts can consume it.
	if album != null and album.opened:
		var at := get_global_mouse_position()
		if event is InputEventScreenTouch or event is InputEventScreenDrag:
			at = event.position
		album.handle_at(event,at)
		get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		handle_at(event,event.position)
	else:
		handle_at(event,get_global_mouse_position())

func handle_at(event: InputEvent, at: Vector2) -> void:
	if album.opened:
		album.handle_at(event,at)
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_K:
		toggle_case()
		return
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_P: toggle_pause()
			KEY_R: reset_scene()
			KEY_M: toggle_mute()
		if play.active():
			if not paused:
				play.handle_at(event,at)
			return
		if flight.active:
			flight.handle_at(event,at)
			return
		if paused:
			return
		if state == "feeding":
			return
		match event.keycode:
			KEY_Y:
				toggle_cloud()
				return
			KEY_N:
				toggle_nap()
				return
			KEY_L:
				toggle_toy()
				return
			KEY_G:
				if state != "cuddle":
					cancel_cup()
					dragging = false
					grooming.cancel()
					bathing.cancel()
					cleanup.collect_one()
			KEY_W:
				if state != "cuddle":
					cancel_cup()
					dragging = false
					grooming.cancel()
					bathing.cancel()
					cleanup.equip_cloth()
			KEY_V:
				if state != "cuddle":
					cancel_cup()
					dragging = false
					grooming.cancel()
					bathing.cancel()
					cleanup.equip_mop()
			KEY_T: equip_brush()
			KEY_S: equip_bath(0)
			KEY_E: equip_bath(1)
			KEY_D: equip_bath(2)
			KEY_ESCAPE:
				cancel_cup()
				dragging = false
				cleanup.cancel_interaction()
				grooming.cancel()
				bathing.cancel()
				next_gesture = elapsed + 8
			KEY_F: start_feeding()
			KEY_J: start_drinking()
			KEY_U:
				if state != "cuddle":
					cancel_cup()
					cleanup.cancel_interaction()
					grooming.cancel()
					bathing.cancel()
					cup.position = cup.HOME if cup.position.distance_to(cup.NEAR) < 100 else cup.NEAR
					status = "Moon cup moved. A nearby cup can be swatted; J offers a drink."
			KEY_SPACE:
				if state != "cuddle": raise_paw()
			KEY_B:
				if state != "cuddle" and state != "drinking":
					cancel_cup()
					bowl.position = SAFE_BOWL if bowl.position.distance_to(NEAR_BOWL) < 150 else NEAR_BOWL
			KEY_H:
				if state != "cuddle" and state != "drinking": meet_paw()
			KEY_C:
				cuddle_held = true
				start_cuddle()
	if play.active():
		if not paused:
			play.handle_at(event,at)
		return
	if flight.active:
		flight.handle_at(event,at)
		return
	if event is InputEventKey and not event.pressed and event.keycode == KEY_C:
		cuddle_held = false
		released_cuddle = not mouse_held
	if paused:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if not event.pressed and cup_dragging:
			mouse_held = false
			finish_cup_drag()
			return
		if event.pressed and state != "feeding" and state != "cuddle" and state != "drinking" and cup.contains(at):
			cleanup.cancel_interaction()
			cleanup.feedback = ""
			grooming.cancel()
			grooming.feedback = ""
			bathing.cancel()
			bathing.feedback = ""
			dragging = false
			state = "idle"
			next_gesture = elapsed+12
			if cup.water == 0:
				cup.refill()
				status = "Fresh water in its favorite moon cup."
			cup_dragging = true
			drag_offset = cup.position-at
			return
	if event is InputEventMouseMotion and cup_dragging:
		var target := at+drag_offset
		cup.position = Vector2(clampf(target.x,120,1100),clampf(target.y,280,680))
		status = "Release for little sips." if cup.position.distance_to(MOUTH) < 95 else "Lift the moon cup to the snout."
		return
	if handle_care_input_at(event,at):
		return
	if state == "drinking":
		if event is InputEventMouseButton and event.pressed and at.distance_to(CHEEK) < 110:
			mouse_held = true
			start_cuddle()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		mouse_held = event.pressed
		if not event.pressed:
			finish_bowl_drag()
			if state == "cuddle":
				released_cuddle = not cuddle_held
			return
		if state == "cuddle":
			released_cuddle = false
			return
		if state == "feeding":
			return
		if bowl.contains(at):
			if not bowl.full:
				bowl.refill()
				status = "Fresh moonpear. Same baby."
			dragging = true
			drag_offset = bowl.position - at
		elif paw.amount > 0.25 and at.distance_to(paw.palm_position()) < 75:
			meet_paw()
		elif at.distance_to(CHEEK) < 110:
			start_cuddle()
		elif at.distance_to(HOME) < 200:
			raise_paw()
	if event is InputEventMouseMotion and dragging:
		var target := at + drag_offset
		bowl.position = Vector2(clampf(target.x,120,1160),clampf(target.y,280,680))
		status = "Release to feed the baby." if bowl.position.distance_to(MOUTH) < 130.0 else "Lift the bowl to its mouth, or move it away from the paw."

func reset_scene() -> void:
	album.close_case()
	play.stop()
	flight.land(false)
	paused = false
	cup.reset()
	cup_dragging = false
	sips_taken = 0
	glance_active = false
	bowl.set_process(true)
	cleanup.set_process(true)
	baby_mess.set_process(true)
	grooming.set_process(true)
	grooming.reset()
	bathing.set_process(true)
	bathing.reset()
	cleanup.reset()
	state = "idle"
	state_time = 0
	elapsed = 0
	next_gesture = 6
	dragging = false
	mouse_held = false
	cuddle_held = false
	paw.amount = 0
	paw.position = ARM_HOME
	paw.rotation = -0.45
	hand.amount = 0
	snack.visible = false
	baby.texture = IDLE_ART
	bowl.position = NEAR_BOWL
	bowl.refill()
	care.reset()
	care_signals.reset()
	feeding_bites = 0
	feeding_end = INF
	status = "Lift the moonpear bowl to its mouth to feed it. Or press F."
	pause_button.text = "Pause"
	helper.text = "Bowl to mouth: feed / F. Paw: high-five. Hold cheek: affection. Empty bowl: refill."

func toggle_pause() -> void:
	if album.opened:
		return
	paused = not paused
	if not paused:
		focus_suspended = false # Explicit resume begins a new active interval.
	pause_button.text = "Resume" if paused else "Pause"
	bowl.set_process(not paused and not flight.active and not play.active())
	cleanup.set_process(not paused and not flight.active and not play.active())
	baby_mess.set_process(not paused and not flight.active and not play.active())
	grooming.set_process(not paused and not flight.active and not play.active())
	bathing.set_process(not paused and not flight.active and not play.active())
	if paused:
		flight.release_input()
		play.release_input()
		if cup_dragging:
			cancel_cup()
		cleanup.cancel_interaction()
		grooming.cancel()
		bathing.cancel()
		hud.visible = true
		hud.modulate.a = 1.0
	dragging = false
	# A key/button pause should never leave an input stuck down.
	if paused and state == "cuddle":
		released_cuddle = true
		mouse_held = false
		cuddle_held = false
	helper.text = "Paused. Press P to resume." if paused else "Bowl to mouth: feed / F. Paw: high-five. Hold cheek: affection. Empty bowl: refill."
	queue_redraw()

func toggle_mute() -> void:
	muted = not muted
	mute_button.text = "Sound off" if muted else "Sound on"
	if muted: sound.stop()

func load_preferences() -> void:
	if OS.has_feature("web") and not OS.is_userfs_persistent():
		preferences_error = "Motion setting cannot be saved on this device. Changes last only until reload."
	var config := ConfigFile.new()
	var result := config.load(preferences_path)
	if result == ERR_FILE_NOT_FOUND:
		return
	if result != OK or not config.get_value("accessibility","reduced_motion",false) is bool:
		preferences_error = "Motion setting could not be read. Choose it again to save."
		return
	reduced_motion = config.get_value("accessibility","reduced_motion",false)

func toggle_reduced_motion() -> void:
	reduced_motion = not reduced_motion
	motion_button.text = "Reduced motion: On" if reduced_motion else "Reduced motion: Off"
	motion_button.button_pressed = reduced_motion
	var config := ConfigFile.new()
	config.set_value("accessibility","reduced_motion",reduced_motion)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__qilinBeginMotionSave("+("true" if reduced_motion else "false")+")")
		preferences_browser_status = ""
	var result := config.save(preferences_path)
	var persistent := not OS.has_feature("web") or OS.is_userfs_persistent()
	if result != OK or not persistent:
		preferences_error = "Motion changed for now, but could not be saved on this device."
	elif not OS.has_feature("web"):
		preferences_error = ""
	preferences_label.text = preferences_error
	queue_redraw()

func update_preferences_storage_feedback() -> void:
	if not OS.has_feature("web") or not OS.is_userfs_persistent():
		return
	var browser_status = JavaScriptBridge.eval("window.__qilinMotionStorage.status")
	if browser_status == preferences_browser_status:
		return
	preferences_browser_status = browser_status
	if browser_status == "failed":
		preferences_error = "Motion changed for now, but could not be saved on this device."
	elif browser_status == "saved":
		preferences_error = ""
	else:
		return
	preferences_label.text = preferences_error

func update_motion_browser_probe() -> void:
	# Read-only, opt-in observation of the actual rendered controls; no test actions.
	if not OS.has_feature("web") or not JavaScriptBridge.eval("window.__qilinMotionProbeEnabled === true"):
		return
	var rect := motion_button.get_global_rect()
	var snapshot := {"reduced":reduced_motion,"text":motion_button.text,"pressed":motion_button.button_pressed,"visible":motion_button.is_visible_in_tree(),"alpha":hud.modulate.a,"button":{"x":rect.position.x,"y":rect.position.y,"width":rect.size.x,"height":rect.size.y},"feedback":preferences_label.text,"feedback_visible":preferences_label.is_visible_in_tree(),"persistent":OS.is_userfs_persistent(),"flight":flight.active,"paused":paused,"state":state}
	JavaScriptBridge.eval("window.__qilinMotionProbe = "+JSON.stringify(snapshot))

func update_care_browser_probe() -> void:
	if not OS.has_feature("web") or not JavaScriptBridge.eval("window.__qilinProbe === true"):
		return
	var snapshot: Dictionary = care.snapshot()
	snapshot.merge({"state":state,"status":status,"elapsed":elapsed,"paused":paused,"suspended":focus_suspended,"pieces":bowl.pieces,"bites":feeding_bites,"mode":play.mode,"sleeping":play.sleeping,"settling":play.settling,"boops":play.boops,"wants_play":care.wants_play(),"wants_food":care.wants_food(),"refusal":care_signals.refusal,"album":album.opened,"flight":flight.active})
	JavaScriptBridge.eval("window.__qilinCareProbe = "+JSON.stringify(snapshot))

func play_sound(stream: AudioStream) -> void:
	if muted: return
	sound.stream = stream
	sound.play()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		care_focus_changed(false)
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		focus_suspended = false

func care_focus_changed(focused: bool) -> void:
	focus_suspended = not focused
	if not focused and is_instance_valid(pause_button) and not paused and not album.opened:
		toggle_pause()

func _draw() -> void:
	draw_texture_rect(BACKDROP,Rect2(0,0,1280,800),false)
	# Clear HUD contrast without competing with the illustrated world.
	draw_rect(Rect2(0,0,1280,91),Color(0.21,0.12,0.31,0.81 * ui_alpha))
	draw_rect(Rect2(25,703,1230,84),Color(1.0,0.96,0.87,0.93 * ui_alpha))
	# Floor shadow under the illustrated creature.
	if not is_instance_valid(flight) or not flight.active:
		draw_set_transform(Vector2(671,680),0,Vector2(225,30))
		draw_circle(Vector2.ZERO,1,Color(0.26,0.12,0.37,0.19))
		draw_set_transform(Vector2.ZERO)
		draw_string(ThemeDB.fallback_font,Vector2(242,697),"MOON CUP / J",HORIZONTAL_ALIGNMENT_LEFT,-1,17,Color("#352044"))
	for petal in petals:
		var visual_time := 0.0 if reduced_motion else elapsed
		var x := fmod(petal.x + visual_time * (7+petal.z*10),1320)-20
		var y := petal.y + sin(visual_time * 0.6 + petal.x)*15
		draw_set_transform(Vector2(x,y),sin(visual_time+petal.x),Vector2(5,2))
		draw_circle(Vector2.ZERO,1,Color(1.0,0.64,0.84,0.5))
	draw_set_transform(Vector2.ZERO)
	if paused:
		draw_rect(Rect2(0,0,1280,800),Color(0.12,0.06,0.2,0.48))
		draw_string(ThemeDB.fallback_font,Vector2(554,388),"Paused",HORIZONTAL_ALIGNMENT_LEFT,-1,40,Color("#fff2ce"))
		draw_string(ThemeDB.fallback_font,Vector2(530,425),"P to return to the baby",HORIZONTAL_ALIGNMENT_LEFT,-1,18,Color("#f2ddff"))

