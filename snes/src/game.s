; The game: riding, carving, airs, the things in the wave and wipeouts.

CARVE = $017F               ; 1.49 angle units a frame (2.2 radians a second)

; ---------------------------------------------------------------------------
rnd8:
    .a8
    .i16
    rep #$20
    lda rng
    .repeat 8
    lsr
    bcc :+
    eor #$B400
:
    .endrepeat
    sta rng
    sep #$20
    rts                     ; A = a random byte

; A = n; gives a number from 0 to n-1
rnd_n:
    .a8
    .i16
    sta tmp3
    jsr rnd8
    sta WRMPYA
    lda tmp3
    sta WRMPYB
    nop
    nop
    nop
    nop
    lda RDMPYH
    rts

; ---------------------------------------------------------------------------
; The riding angle plus or minus a bit (A = how much), kept inside the wave
rnd_near:
    .a8
    .i16
    sta tmp2
    asl
    inc a
    jsr rnd_n               ; 0..2r
    sec
    sbc tmp2                ; -r..r
    sta tmp2+1
    lda pa+1
    clc
    adc tmp2+1
    ; (a signed byte added to an angle in 102..227: no wrap)
    bra rnd_clamp
rnd_any:
    .a8
    .i16
    lda #(A_HI-A_LO-8)
    jsr rnd_n
    clc
    adc #(A_LO+4)
rnd_clamp:
    cmp #(A_LO+3)
    bcs @1
    lda #(A_LO+3)
@1:
    cmp #(A_HI-3)
    bcc @2
    lda #(A_HI-3)
@2:
    rts

; add the thing described in s_* to the wave
spawn_obj:
    .a8
    .i16
    rep #$20
    ldx #0
@f:
    lda o_type,x
    beq @got
    inx
    inx
    cpx #(NOBJ*2)
    bcc @f
    sep #$20
    rts
@got:
    lda s_type
    sta o_type,x
    lda s_z
    sta o_z,x
    lda s_a
    sta o_a,x
    lda s_h
    sta o_h,x
    lda s_va
    sta o_va,x
    lda s_vz
    sta o_vz,x
    lda s_amp
    sta o_amp,x
    lda s_a1
    sta o_a1,x
    stz o_u,x
    stx tmp0
    sep #$20
    jsr rnd8
    rep #$20
    and #$00FF
    ldx tmp0
    sta o_w,x
    stx tmp0
    sep #$20
    jsr rnd8
    and #$01
    rep #$20
    and #$00FF
    ldx tmp0
    sta o_f,x
    sep #$20
    rts

; sets up s_* for a thing at the current s_z, angle A (a byte), 0 high, ...
.macro SETA
    rep #$20
    and #$00FF
    xba
    sta s_a
    sep #$20
.endmacro

; common defaults: on the water, not drifting
clear_s:
    .a8
    .i16
    rep #$20
    stz s_h
    stz s_va
    stz s_vz
    stz s_amp
    stz s_a1
    sep #$20
    rts

; ---------------------------------------------------------------------------
; One pattern comes out of the light: what, and then how long to the next
spawn_pattern:
    .a8
    .i16
    rep #$20
    lda #$2C00
    sta s_z
    sep #$20
    lda spawned
    bne @notfirst
    rep #$20
    lda #$1E00              ; the first is already close
    sta s_z
    sep #$20
@notfirst:
    lda spawned
    cmp #7
    bcs @rand
    bra @have
@rand:
    jsr rnd8
    ldx #0
    cmp #61
    bcc @pick
    inx
    cmp #107
    bcc @pick
    inx
    cmp #138
    bcc @pick
    inx
    cmp #171
    bcc @pick
    inx
    cmp #202
    bcc @pick
    inx
    cmp #230
    bcc @pick
    inx
@pick:
    txa
    bra @go
@have:
    lda spawned
@go:
    pha
    lda spawned
    cmp #200
    bcs @nocnt
    inc spawned
@nocnt:
    pla
    rep #$20
    and #$00FF
    asl
    tax
    sep #$20
    jmp (.loword(pat_tbl),x)
pat_tbl:
    .word .loword(pat_surfer), .loword(pat_fins), .loword(pat_turtle), .loword(pat_board), .loword(pat_pack), .loword(pat_shark), .loword(pat_jellies)

pat_surfer:
    .a8
    .i16
    jsr clear_s
    lda #12
    jsr rnd_near
    SETA
    rep #$20
    lda #T_SURFER
    sta s_type
    sep #$20
    lda #6
    jsr rnd_n
    clc
    adc #6
    sta s_vz
    lda #10
    jsr rnd_n
    clc
    adc #5
    sta s_amp
    jsr spawn_obj
    ; later on, sometimes a second one right behind
    rep #$20
    lda runT
    cmp #3600
    bcc @one
    sep #$20
    jsr rnd8
    cmp #128
    bcs @one
    jsr clear_s
    rep #$20
    lda s_z
    sta tmp0
    sep #$20
    lda #3
    jsr rnd_n
    rep #$20
    and #$00FF
    inc a
    inc a
    xba
    clc
    adc tmp0
    sta s_z
    lda #T_SURFER
    sta s_type
    sep #$20
    lda #6
    jsr rnd_n
    clc
    adc #6
    sta s_vz
    lda #8
    sta s_amp
    jsr rnd_any
    SETA
    jsr spawn_obj
    lda #4
    jmp set_next
@one:
    sep #$20
    lda #1
    jmp set_next

pat_fins:
    .a8
    .i16
    rep #$20
    lda runT
    xba
    and #$00FF
    lsr
    lsr
    lsr
    lsr                     ; 0 at first, up to 2 after a couple of minutes
    sep #$20
    clc
    adc #2
    jsr rnd_n
    clc
    adc #2
    sta cnt                 ; 2..5
@fin:
    jsr clear_s
    rep #$20
    lda #T_FIN
    sta s_type
    lda s_z
    pha
    sep #$20
    lda #4
    jsr rnd_n
    rep #$20
    and #$00FF
    xba
    clc
    adc 1,s
    sta s_z
    sep #$20
    jsr rnd_any
    SETA
    lda #75
    jsr rnd_n
    clc
    adc #62
    rep #$20
    and #$00FF
    sta s_va
    sep #$20
    jsr rnd8
    and #$01
    beq @pos
    rep #$20
    lda #0
    sec
    sbc s_va
    sta s_va
    sep #$20
@pos:
    rep #$20
    lda #2
    sta s_vz
    lda #1
    sta s_amp
    sep #$20
    jsr spawn_obj
    rep #$20
    pla
    sta s_z
    sep #$20
    dec cnt
    bne @fin
    lda #4
    jmp set_next

pat_turtle:
    .a8
    .i16
    lda #2
    sta cnt
    rep #$20
    lda s_z
    pha
    sep #$20
@t:
    jsr clear_s
    rep #$20
    lda #T_TURTLE
    sta s_type
    sep #$20
    lda #10
    jsr rnd_near
    SETA
    lda #3
    sta s_vz
    lda #2
    sta s_amp
    lda #30
    jsr rnd_n
    rep #$20
    and #$00FF
    sec
    sbc #15
    sta s_va
    sep #$20
    jsr spawn_obj
    dec cnt
    beq @done
    jsr rnd8
    cmp #128
    bcs @done
    rep #$20
    pla
    pha
    sta s_z
    sep #$20
    lda #3
    jsr rnd_n
    rep #$20
    and #$00FF
    inc a
    xba
    clc
    adc s_z
    sta s_z
    sep #$20
    bra @t
@done:
    rep #$20
    pla
    sep #$20
    lda #3
    jmp set_next

pat_board:
    .a8
    .i16
    jsr clear_s
    rep #$20
    lda #T_BOARD
    sta s_type
    lda #128
    sta s_h
    sep #$20
    lda #30
    jsr rnd_near
    SETA
    lda #2
    sta s_amp
    jsr spawn_obj
    lda #1
    jmp set_next

pat_pack:
    .a8
    .i16
    ; a row of surfers right across the face, with one way through
    lda #(A_HI-A_LO-24)
    jsr rnd_n
    clc
    adc #(A_LO+12)
    sta s_u                ; the gap
    lda #6
    jsr rnd_n
    clc
    adc #6
    sta s_u+1              ; their speed
    lda #(A_LO+2)
    sta cnt
@p:
    lda cnt
    sec
    sbc s_u
    bcs @abs
    eor #$FF
    inc a
@abs:
    cmp #15
    bcc @skip               ; the gap
    jsr clear_s
    rep #$20
    lda #T_PACK
    sta s_type
    sep #$20
    lda s_u+1
    sta s_vz
    lda #2
    sta s_amp
    lda cnt
    SETA
    jsr spawn_obj
@skip:
    lda cnt
    clc
    adc #15
    sta cnt
    cmp #A_HI
    bcc @p
    lda #1
    jmp set_next

pat_shark:
    .a8
    .i16
    jsr clear_s
    rep #$20
    lda #T_SHARK
    sta s_type
    sep #$20
    lda #(((A_LO+A_HI)/2)-A_LO)
    jsr rnd_n
    clc
    adc #A_LO               ; where it leaps from
    sta s_u
    lda #32
    jsr rnd_n
    clc
    adc #49
    clc
    adc s_u
    cmp #(A_HI+20)
    bcc @ok
    lda #(A_HI+20)
@ok:
    sta s_u+1              ; where it comes down
    jsr rnd8
    and #$01
    beq @fwd
    lda s_u
    pha
    lda s_u+1
    sta s_u
    pla
    sta s_u+1
@fwd:
    lda s_u
    SETA
    lda s_u+1
    rep #$20
    and #$00FF
    xba
    sta s_a1
    sep #$20
    jsr spawn_obj
    lda #1
    jmp set_next

pat_jellies:
    .a8
    .i16
    lda #4
    jsr rnd_n
    clc
    adc #5
    sta cnt
    rep #$20
    lda s_z
    pha
    sep #$20
@j:
    jsr clear_s
    rep #$20
    lda #T_JELLY
    sta s_type
    sep #$20
    jsr rnd8
    SETA
    lda #200
    jsr rnd_n
    clc
    adc #50
    rep #$20
    and #$00FF
    sta s_h                 ; 0.2 to 1.0 up from the wall
    sep #$20
    lda #40
    jsr rnd_n
    clc
    adc #20
    rep #$20
    and #$00FF
    eor #$FFFF
    inc a
    sta s_va                ; drifting round
    lda 1,s
    sta s_z
    sep #$20
    lda #6
    jsr rnd_n
    rep #$20
    and #$00FF
    xba
    clc
    adc s_z
    sta s_z
    sep #$20
    jsr spawn_obj
    dec cnt
    bne @j
    rep #$20
    pla
    sep #$20
    lda #6
    ; fall into set_next

; A = how deep the pattern was, in radii. Works out when the next comes.
set_next:
    .a8
    .i16
    sta tmp3
    rep #$20
    lda runT
    lsr
    lsr
    lsr
    lsr
    lsr
    cmp #256
    bcc @d
    lda #255
@d:
    sta tmp2                ; how hard it's got, 0..255
    lda spd_r
    lsr
    lsr
    cmp #5
    bcs @v
    lda #5
@v:
    sta tmp1                ; speed in radii a second
    sep #$20
    lda tmp2
    sta WRMPYA
    lda #102
    sta WRMPYB
    nop
    nop
    nop
    nop
    lda RDMPYH
    sta tmp0
    lda #255
    sec
    sbc tmp0
    sta tmp0                ; (1 - 0.4 * hard)
    lda tmp1
    sta WRMPYA
    lda tmp0
    sta WRMPYB
    nop
    nop
    nop
    nop
    rep #$20
    lda RDMPYL
    sta tmp0                ; v * (1 - 0.4h), 8.8 radii
    sep #$20
    lda tmp2
    sta WRMPYA
    lda #115
    sta WRMPYB
    nop
    nop
    nop
    nop
    lda RDMPYH
    sta tmp2+1
    lda #255
    sec
    sbc tmp2+1
    sta WRMPYB
    lda tmp1
    sta WRMPYA
    nop
    nop
    nop
    nop
    lda RDMPYH              ; v * (1 - 0.45h), radii
    sta tmp1+1
    jsr rnd8
    sta WRMPYA
    lda tmp1+1
    sta WRMPYB
    nop
    nop
    nop
    nop
    rep #$20
    lda RDMPYL              ; a random share of that, 8.8
    clc
    adc tmp0
    cmp #1536
    bcs @gap
    lda #1536               ; never closer than six radii
@gap:
    sta tmp0
    lda tmp3
    and #$00FF
    xba
    clc
    adc tmp0
    clc
    adc nextd
    sta nextd
    sep #$20
    rts

; ---------------------------------------------------------------------------
; Move everything in the wave; if `A` is non-zero, see whether you hit any of it
update_objects:
    .a8
    .i16
    sta tmp3+1              ; collide?
    ldx #0
@o:
    stx ob_i
    rep #$20
    lda o_type,x
    and #$00FF
    bne @live
    jmp @next
@live:
    ; closing speed: how fast you ride, less how fast it goes
    lda o_z,x
    sec
    sbc spd_r
    clc
    adc o_vz,x
    sta o_z,x
    clc
    adc #$0300
    bpl @alive
    stz o_type,x
    jmp @next
@alive:
    lda o_type,x
    and #$00FF
    cmp #T_SHARK
    bne @plain
    jmp @leaper
@plain:
    lda o_a,x
    clc
    adc o_va,x
    sta o_a,x
    ; wandering to and fro across the face
    lda frame
    asl
    clc
    adc o_w,x
    and #$00FF
    asl
    tay
    lda sin16,y
    asl
    sta tmp0
    lda o_amp,x
    sta tmp1
    jsr mulm7
    sta tmp2
    ldx ob_i
    lda o_a,x
    xba
    and #$00FF
    clc
    adc tmp2
    and #$00FF
    sta o_ad,x
    jmp @hit

@leaper:
    ; a shark waits, then leaps clean across as you get there
    lda o_f,x
    and #$0004
    bne @flying
    lda spd_r
    asl
    asl
    asl
    asl
    asl
    asl
    sta tmp0
    lda spd_r
    asl
    asl
    asl
    asl
    clc
    adc tmp0
    sta tmp0                ; ~ 80 * speed: how far off it starts
    lda o_z,x
    cmp tmp0
    bcs @idle
    lda o_f,x
    ora #$0004
    sta o_f,x
    stz o_u,x
    sep #$20
    lda #5
    sta snd_q               ; a shark leaps
    rep #$20
@flying:
    lda o_u,x
    clc
    adc #3
    sta o_u,x
    cmp #255
    bcc @arc
    stz o_type,x
    jmp @next
@arc:
    ; the angle: a0 + (a1 - a0) * u
    lda o_a1,x
    sec
    sbc o_a,x
    sta tmp0
    lda o_u,x
    lsr
    sta tmp1
    jsr mulm7               ; diff * (u/2) / 256
    asl
    sta tmp2
    ldx ob_i
    lda o_a,x
    clc
    adc tmp2
    xba
    and #$00FF
    sta o_ad,x
    ; the height: a parabola, half a radius at the top
    lda o_u,x
    and #$00FF
    sep #$20
    sta WRMPYA
    eor #$FF
    sta WRMPYB
    nop
    nop
    nop
    nop
    rep #$20
    lda RDMPYL
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    sta o_h,x
    jmp @hit
@idle:
    lda o_a,x
    xba
    and #$00FF
    sta o_ad,x
    stz o_h,x
    jmp @next

@hit:
    sep #$20
    lda tmp3+1
    bne :+
    jmp @next8
:
    rep #$20
    ldx ob_i
    ; only things right where you are
    lda o_z,x
    clc
    adc #80
    bmi @next
    cmp #160
    bcs @next
    lda o_type,x
    and #$00FF
    cmp #T_SHARK
    bne @notshark
    lda o_f,x
    and #$0004
    beq @next
@notshark:
    lda o_type,x
    and #$00FF
    asl
    tay
    sep #$20
    lda o_ad,x
    sec
    sbc pa+1
    bpl @abs
    eor #$FF
    inc a
@abs:
    cmp t_hw,y
    bcs @next8
    ; up and down: your feet to your head, against its extent
    rep #$20
    lda h16
    lsr
    lsr
    lsr
    lsr
    sta tmp0                ; how high you are, 8.8
    lda o_h,x
    clc
    adc t_klo,y
    sta tmp1                ; its bottom
    lda o_h,x
    clc
    adc t_khi,y
    sta tmp2                ; its top
    lda tmp0
    clc
    adc #100                ; your head
    sec
    sbc tmp1
    bmi @next               ; it's below... no: head below its bottom: miss
    lda tmp2
    sec
    sbc tmp0
    clc
    adc #10                 ; its top above your feet
    bmi @next
    ; hit
    lda o_type,x
    and #$00FF
    sta dying_kind
    sep #$20
    jsr die
    rts
@next:
    sep #$20
@next8:
    rep #$10
    ldx ob_i
    inx
    inx
    cpx #(NOBJ*2)
    bcs @fin
    jmp @o
@fin:
    rts

; ---------------------------------------------------------------------------
die:
    .a8
    .i16
    lda #M_DYING
    sta mode
    rep #$20
    stz deathT
    lda #8
    sta shake
    sep #$20
    lda #2
    sta snd_q
    rts

; ---------------------------------------------------------------------------
enter_title:
    .a8
    .i16
    lda #M_TITLE
    sta mode
    lda #1
    sta mus_shift
    jsr clear_text
    PUTSTRIP strip_neverending, 5, 12
    PUTSTRIP strip_tunnel, 6, 14
    PUTSTRIP strip_iii, 20, 14
    PUTS s_sub, 9, 16, 1
    PUTS s_keys, 5, 19, 0
    rep #$20
    lda #$0022
    sta qpf
    stz va
    sep #$20
    rts

start_run:
    .a8
    .i16
    lda #M_RUN
    sta mode
    jsr clear_text
    rep #$20
    ldx #0
@c:
    stz o_type,x
    inx
    inx
    cpx #(NOBJ*2)
    bcc @c
    lda #(A_START<<8)
    sta pa
    stz va
    stz h16
    stz vh16
    stz runT
    stz meters
    stz mfrac
    stz shake
    stz nextd
    stz bank
    lda #$0055
    sta qpf
    sep #$20
    stz spawned
    stz speedtick
    lda #$0F
    sta bright
    stz mus_shift
    jsr audio_restart
    lda #1
    sta snd_q
    ; the first pattern comes out straight away
    rep #$20
    stz nextd
    sep #$20
    jsr spawn_pattern
    PUTS s_dist, 1, 1, 0
    PUTS s_m, 11, 1, 0
    PUTS s_best, 20, 1, 1
    rts

enter_over:
    .a8
    .i16
    lda #M_OVER
    sta mode
    lda #1
    sta mus_shift
    rep #$20
    lda meters
    cmp best
    bcc @nb
    sta best
@nb:
    sep #$20
    jsr clear_text
    PUTSTRIP strip_wipeout, 9, 10
    PUTS s_dist, 8, 13, 0
    PUTS s_m, 18, 13, 0
    PUTS s_best, 8, 15, 1
    PUTS s_start, 10, 18, 0
    rep #$20
    lda meters
    sta numtmp
    sep #$20
    lda #13
    sta hud_x
    lda #13
    sta hud_y
    stz hud_pal
    jsr putnum
    rep #$20
    lda best
    sta numtmp
    sep #$20
    lda #13
    sta hud_x
    lda #15
    sta hud_y
    lda #1
    sta hud_pal
    jsr putnum
    rts

; ---------------------------------------------------------------------------
game_update:
    .a8
    .i16
    lda mode
    cmp #M_RUN
    bne @n1
    jmp run_mode
@n1:
    cmp #M_TITLE
    bne @n2
    jmp title_mode
@n2:
    cmp #M_DYING
    bne @n3
    jmp dying_mode
@n3:
    jmp over_mode

; the title: the wave goes by, you drift up and down the face
title_mode:
    .a8
    .i16
    rep #$20
    lda frame
    lsr
    lsr
    and #$00FF
    asl
    tax
    lda sin16,x
    sta tmp0
    lda #26
    sta tmp1
    jsr mulm7               ; about +-13 units
    clc
    adc #(A_START-2)
    ; mulm7 gave units; make 8.8
    xba
    and #$FF00
    sta pa
    ; blink
    lda frame
    lsr
    lsr
    lsr
    lsr
    lsr
    and #$0001
    sep #$20
    sta tmp0
    lda blink
    cmp tmp0
    beq @nb
    lda tmp0
    sta blink
    bne @show
    rep #$20
    lda #1
    sta bg3_dirty
    rep #$20
    ldx #(18*64+10*2)
    lda #0
@clr:
    sta bg3map,x
    inx
    inx
    cpx #(18*64+23*2)
    bcc @clr
    sep #$20
    bra @nb
@show:
    PUTS s_start, 10, 18, 0
@nb:
    sep #$20
    lda pad_new+1
    and #(PAD_START>>8)
    beq @r
    jsr start_run
@r:
    rts

over_mode:
    .a8
    .i16
    rep #$20
    lda #$0018
    sta qpf
    stz va
    stz bank
    sep #$20
    lda pad_new+1
    and #(PAD_START>>8)
    beq @r
    jsr start_run
@r:
    jsr update_objects_idle
    rts

update_objects_idle:
    .a8
    .i16
    rep #$20
    lda qpf
    lsr
    lsr
    sta spd_r
    sep #$20
    lda #0
    jsr update_objects
    rts

dying_mode:
    .a8
    .i16
    rep #$20
    inc deathT
    ; the ride dies away
    lda qpf
    lsr
    lsr
    lsr
    sta tmp0
    lda qpf
    sec
    sbc tmp0
    sta qpf
    lsr
    lsr
    sta spd_r
    lda h16
    sec
    sbc #60
    bpl @h
    lda #0
@h:
    sta h16
    lda deathT
    cmp #84
    bcc @still
    sep #$20
    jsr enter_over
    rts
@still:
    sep #$20
    lda #0
    jsr update_objects
    rts

run_mode:
    .a8
    .i16
    ; ---- the controls
    rep #$20
    stz tmp0
    lda pad
    bit #PAD_RIGHT
    beq @nr
    lda #CARVE
    sta tmp0
@nr:
    lda pad
    bit #PAD_LEFT
    beq @nl
    lda tmp0
    sec
    sbc #CARVE
    sta tmp0
@nl:
    lda tmp0
    sec
    sbc va
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    clc
    adc va
    sta va
    clc
    adc pa
    sta pa
    cmp #(A_LO<<8)
    bcs @lo
    lda #(A_LO<<8)
    sta pa
    lda va
    bpl @lo
    stz va
@lo:
    lda pa
    cmp #(A_HI<<8)
    bcc @hi
    lda #(A_HI<<8)
    sta pa
    lda va
    bmi @hi
    stz va
@hi:
    ; lean the nose
    lda va
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    sta bank
    ; ---- an air
    lda h16
    bne @air
    lda vh16
    bne @air
    lda pad_new
    and #(PAD_B|PAD_A|PAD_UP|PAD_Y|PAD_X)
    beq @noair
    lda #171
    sta vh16
    sep #$20
    lda #3
    sta snd_q
    rep #$20
@air:
    lda vh16
    sec
    sbc #9
    sta vh16
    clc
    adc h16
    sta h16
    bpl @noair
    stz h16
    stz vh16
    sep #$20
    lda #4
    sta snd_q
    rep #$20
@noair:
    ; ---- the ride speeds up
    inc runT
    sep #$20
    inc speedtick
    lda speedtick
    cmp #96
    bcc @ns
    stz speedtick
    rep #$20
    lda qpf
    cmp #$00BB
    bcs @ns16
    inc qpf
@ns16:
    sep #$20
@ns:
    rep #$20
    lda qpf
    lsr
    lsr
    sta spd_r
    ; ---- how far you've come: 0.625 m for every quarter radius
    lda qpf
    and #$00FF
    sta tmp0
    sep #$20
    lda tmp0
    sta WRMPYA
    lda #160
    sta WRMPYB
    nop
    nop
    nop
    nop
    rep #$20
    lda RDMPYL
    clc
    adc mfrac
    sta mfrac
    bcc @nm
    inc meters
@nm:
    ; ---- new things come out of the light
    lda nextd
    sec
    sbc spd_r
    sta nextd
    bpl @nospawn
    sep #$20
    jsr spawn_pattern
    rep #$20
@nospawn:
    sep #$20
    lda #1
    jsr update_objects
    ; ---- the numbers
    lda mode
    cmp #M_RUN
    bne @r
    lda frame
    and #$03
    bne @r
    rep #$20
    lda meters
    sta numtmp
    sep #$20
    lda #6
    sta hud_x
    lda #1
    sta hud_y
    stz hud_pal
    jsr putnum
    rep #$20
    lda best
    sta numtmp
    sep #$20
    lda #25
    sta hud_x
    lda #1
    sta hud_y
    lda #1
    sta hud_pal
    jsr putnum
@r:
    rts

; ---------------------------------------------------------------------------
.segment "RODATA"
s_sub:      .byte "INFINITY WAVE", 0
s_keys:     .byte "ARROWS CARVE  B AIR", 0
s_start:    .byte "PRESS START", 0
s_dist:     .byte "DIST", 0
s_m:        .byte "M", 0
s_best:     .byte "BEST", 0

;            -  surfer fin turtle board shark jelly pack
t_kind:     .word 0, 0, 1, 2, 3, 4, 5, 0
t_mode:     .word 0, 0, 0, 0, 1, 1, 1, 0
t_hw:       .word 0, 7, 5, 9, 12, 7, 6, 7
t_klo:      .word 0, 0, 0, 0, $10000-51, $10000-31, $10000-26, 0
t_khi:      .word 0, 154, 51, 38, 77, 31, 26, 154
.segment "CODE"
