; Shared constants and variables.

HD_SET   = 704              ; bytes between the two sets of HDMA tables
NGROUP   = 56               ; groups of four scanlines
NOBJ     = 16
CX       = 128              ; the way out, on screen
CY       = 90

; game modes
M_TITLE  = 0
M_RUN    = 1
M_DYING  = 2
M_OVER   = 3

; object types
T_SURFER = 1
T_FIN    = 2
T_TURTLE = 3
T_BOARD  = 4
T_SHARK  = 5
T_JELLY  = 6
T_PACK   = 7

; angles run 0..255 round the barrel; you ride between A_LO and A_HI
A_LO     = 102
A_HI     = 227
A_START  = 176

.segment "ZEROPAGE"
nmi_flag:   .res 1
ready:      .res 1
mode:       .res 1
bright:     .res 1
frame:      .res 2
pad:        .res 2
pad_prev:   .res 2
pad_new:    .res 2
pal_acc:    .res 3          ; palette phase, 8.8 (hi byte 0..14); 3rd byte pads reads
qpf:        .res 2          ; ride speed in quarter radii a frame, 8.8
spd_r:      .res 2          ; the same in radii a frame, 8.8
Sf:         .res 2          ; position along the barrel: fraction ...
Sq:         .res 2          ; ... and quarter radii
front:      .res 2          ; which HDMA table set is live: 0 or HD_SET
vofs1:      .res 2
vofs2:      .res 2
vofs3:      .res 2
rng:        .res 2
tmp0:       .res 2
tmp1:       .res 2
tmp2:       .res 2
tmp3:       .res 2
P0:         .res 2
dP6:        .res 2
Cc:         .res 2
tb:         .res 2
w1i:        .res 2
w2i:        .res 2
prev_n:     .res 2

; the rider
pa:         .res 2          ; angle round the barrel, 8.8
va:         .res 2          ; carving speed, signed 8.8
h16:        .res 2          ; height off the water, 1/4096 radius, signed
vh16:       .res 2
bank:       .res 2          ; lean for the nose, signed
runT:       .res 2          ; frames riding
meters:     .res 2
mfrac:      .res 2
best:       .res 2
deathT:     .res 2
shake:      .res 2
nextd:      .res 2          ; radii (8.8) until the next pattern comes out of the light
spawned:    .res 1
hold:       .res 1          ; a frame counter for slowing down
speedtick:  .res 1
dying_kind: .res 1

; spawning and drawing
s_type:     .res 2
s_z:        .res 2
s_a:        .res 2
s_h:        .res 2
s_va:       .res 2
s_vz:       .res 2
s_amp:      .res 2
s_a1:       .res 2
s_u:        .res 2
sp_x:       .res 2
sp_y:       .res 2
sp_t:       .res 1
sp_a:       .res 1
sp_s:       .res 1
oam_n:      .res 1
pj_d:       .res 2
pj_r:       .res 2
pj_e:       .res 2
pj_k:       .res 2
pj_x:       .res 2
pj_y:       .res 2
ob_i:       .res 2
ob_x:       .res 2
ob_y:       .res 2
ob_box:     .res 2
ob_fl:      .res 2
ob_attr:    .res 2
ob_ptr:     .res 2
cnt:        .res 2
hud_x:      .res 1
hud_y:      .res 1
hud_pal:    .res 1
str_ptr:    .res 2
numtmp:     .res 2
sort_n:     .res 2
blink:      .res 1
bg3_dirty:  .res 1
seq_on:     .res 1
seq_pos:    .res 2
seq_acc:    .res 2
kon_m:      .res 1
kof_m:      .res 1
kof_pend:   .res 1
ctr_l:      .res 1
ctr_r:      .res 1
ctr_b:      .res 1
vib_on:     .res 1
vib_t:      .res 1
vib_base:   .res 2
snd_seq:    .res 1
snd_dead:   .res 1
UP_DONE = 6
snd_n:      .res 1
snd_arg:    .res 1
v7_busy:    .res 1
v7_t:       .res 1
v7_p:       .res 2
v7_dp:      .res 2
roar_t:     .res 1
crash_t:    .res 1
dive_t:     .res 1
dive_p:     .res 2
leap2_t:    .res 1
av:         .res 2
ap:         .res 2
mus_shift:  .res 1
up_state:   .res 1
up_i:       .res 2
snd_q:      .res 2          ; sound effect requested
ob_scale:   .res 2
ob_kind:    .res 2
ob_flipv:   .res 2
ob_fliph:   .res 2
ob_pc:      .res 2
pc_dx:      .res 2
pc_dy:      .res 2
pc_sz:      .res 2
ob_x0:      .res 2
ob_y0:      .res 2

.segment "BSS"
oam:        .res 544
oamx:       .res 128
hdma_buf:   .res 1408       ; two sets of (BG1 HOFS, BG2 HOFS, BG3 HOFS, spare) x 176
bend:       .res 112        ; sideways bend per group in pixels, for the sprites
bg3map:     .res 2048
order:      .res (NOBJ*2)
fx:         .res (20*16)

o_type:     .res (NOBJ*2)
o_z:        .res (NOBJ*2)   ; radii ahead, 8.8
o_a:        .res (NOBJ*2)   ; angle, 8.8
o_ad:       .res (NOBJ*2)   ; angle as shown (with its wandering), 0..255
o_h:        .res (NOBJ*2)   ; height above the water, signed 8.8
o_va:       .res (NOBJ*2)
o_vz:       .res (NOBJ*2)
o_w:        .res (NOBJ*2)   ; wander phase
o_amp:      .res (NOBJ*2)
o_f:        .res (NOBJ*2)   ; 1 = flip, 2 = missed, 4 = leaping
o_u:        .res (NOBJ*2)   ; leap progress
o_a1:       .res (NOBJ*2)   ; where a leap lands
