extends RefCounted
## Presentation only. Reuse the painted face; never redraw eyes or change needs.

var refusal := 0.0
var last_tell := ""

func reset() -> void:
	refusal = 0
	last_tell = ""

func idle(host: Node2D, delta: float) -> void:
	if host.state != "idle" or host.dragging or host.cup_dragging or host.cleanup.active() or host.grooming.selected or host.bathing.selected >= 0:
		return
	var motion := 0.2 if host.reduced_motion else 1.0
	var tell := ""
	var text := ""
	if refusal > 0:
		refusal = maxf(0,refusal-delta)
		host.baby.texture = host.REST_ART
		host.glance_active = false
		# A whole-body lean away, with the shoulder and paw still attached.
		host.baby.position.x = host.HOME.x+sin(refusal/1.8*PI)*22*motion
		host.baby.rotation = 0.035*motion
		return
	var beat := fmod(host.elapsed,12.0)
	if host.care.tired():
		host.baby.texture = host.REST_ART
		host.glance_active = false
		host.baby.position.y = host.HOME.y+8*motion
		tell = "tired"
		text = "Heavy eyelids, quiet paws. A blanket and a cheek hold would feel good. N: nap."
	elif beat > 8 and beat < 11 and host.care.hunger >= host.care.HUNGRY:
		host.baby.texture = host.GLANCE_LEFT if host.bowl.position.x < host.MOUTH.x else host.GLANCE_RIGHT
		host.glance_active = false
		host.baby.position.x = host.HOME.x-5*motion
		tell = "hungry"
		text = "A hopeful look at the moonpear bowl, then at you. Lift it to the snout, or F."
	elif beat > 4 and beat < 6 and not host.glance_active:
		if host.care.interest >= 55:
			host.paw.rotation += sin(beat*6)*0.07*motion
			tell = "playful"
			text = "A little paw shuffle. Someone has energy for the star ball. L: play."
		elif not host.care.wants_food():
			host.baby.texture = host.REST_ART
			tell = "full"
			text = "A contented blink. Moonpear was lovely. No more food just now."
		elif host.care.interest <= host.care.SATISFIED:
			host.baby.texture = host.REST_ART
			tell = "satisfied"
			text = "Quiet paws and a happy huff. Content to watch for a while."
	if not tell.is_empty() and tell != last_tell:
		host.status = text
		last_tell = tell
