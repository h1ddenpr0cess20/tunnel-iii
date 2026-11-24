; Sound: the song from sound.js played by the S-DSP, one sixteenth at a time.
;
; The SPC700 only runs a tiny program that writes DSP registers on command
; (see tools/build_audio.py); everything musical happens here. Voices:
;   0 lead guitar   1 rhythm guitar (left)   2 rhythm guitar (right)   3 bass
;   4 kick   5 snare   6 hats, ride, cymbal   7 toms and sound effects, else the roar of the barrel

.macro POKE r, v
    lda #v
    ldy #r
    jsr apoke
.endmacro

; A = value, Y = DSP register
apoke:
    .a8
    .i16
    phx
    sta APUIO2
    tya
    sta APUIO1
    inc snd_seq
    lda snd_seq
    sta APUIO0
    ldx #$2000
@w:
    lda APUIO0
    cmp snd_seq
    beq @ok
    dex
    bne @w
    lda #1
    sta snd_dead            ; the SPC isn't answering: go quiet rather than hang
@ok:
    plx
    rts

; A = value, written to both halves of voice volume: Y = the voice's first register
vol2:
    .a8
    .i16
    jsr apoke
    iny
    jsr apoke
    rts

; Uploading the sound program and samples with the boot ROM's protocol takes a
; while (it's one handshake a byte), so it's done in the main loop's idle time,
; a byte at a time, and the title screen is up and running meanwhile.
;   0 waiting for the SPC700   1 start sent, waiting for its reply   2 sending bytes
;   3 jump sent, give it a moment   4 setting up the DSP   (UP_DONE: playing)
audio_pump:
    .a8
    .i16
    lda up_state
    bne @s1
    ; 0: the boot ROM says $AA $BB when it's ready
    lda APUIO0
    cmp #$AA
    bne @r
    lda APUIO1
    cmp #$BB
    bne @r
    ldx #$0200
    stx APUIO2
    lda #$01
    sta APUIO1
    lda #$CC
    sta APUIO0
    lda #1
    sta up_state
@r:
    rts
@s1:
    cmp #1
    bne @s2
    lda APUIO0
    cmp #$CC
    bne @r
    rep #$20
    stz up_i
    sep #$20
    stz snd_n
    lda #2
    sta up_state
    rts
@s2:
    cmp #2
    bne @s3
    ldx up_i
    lda f:audio_blob,x
    sta APUIO1
    lda snd_n
    sta APUIO0
@ack:
    lda APUIO0
    cmp snd_n
    bne @ack
    inc snd_n
    inx
    stx up_i
    cpx #AUDIO_BLOB_SIZE
    bcc @r
    ; all there: run it
    ldx #$0200
    stx APUIO2
    stz APUIO1
    lda snd_n
    inc a
    bne @nz
    inc a
@nz:
    sta APUIO0
    sta snd_seq
    lda #3
    sta up_state
    stz snd_n               ; (now counts frames of grace)
    rts
@s3:
    cmp #3
    bne @s4
    ldx #$0800
@d:
    dex                     ; let the SPC700 get going
    bne @d
    lda #4
    sta up_state
    rts
@s4:
    ; 4: the DSP
    ldx #0
@init:
    lda dsp_init,x
    tay
    lda dsp_init+1,x
    jsr apoke
    inx
    inx
    cpx #DSP_INIT_SIZE
    bcc @init
    lda #1
    sta seq_on
    rep #$20
    stz seq_pos
    stz seq_acc
    sep #$20
    lda #UP_DONE
    sta up_state
    rts

; the band starts from the top when you drop in
audio_restart:
    .a8
    .i16
    lda up_state
    cmp #UP_DONE
    bcc @r
    lda snd_dead
    bne @r
    POKE $5C, $FF
    lda #1
    sta kof_pend
    sta seq_on
    rep #$20
    stz seq_pos
    stz seq_acc
    sep #$20
    stz ctr_l
    stz ctr_r
    stz ctr_b
    stz vib_on
    stz v7_busy
    stz roar_t
    stz crash_t
    stz dive_t
@r:
    rts

; ---------------------------------------------------------------------------
audio_tick:
    .a8
    .i16
    lda up_state
    cmp #UP_DONE
    bcs @up
    stz snd_q               ; not ready yet: no sound
    rts
@up:
    lda snd_dead
    beq @live
    stz snd_q
    rts
@live:
    lda kof_pend
    beq @nk
    stz kof_pend
    POKE $5C, 0
@nk:
    lda snd_q
    beq @nq
    stz snd_q
    jsr sfx_start
@nq:
    ; the crash's notes come a frame after the key-offs
    lda crash_t
    beq @nc
    dec crash_t
    bne @nc
    jsr crash_notes
@nc:
    ; the song: a sixteenth every 5.12 frames
    lda seq_on
    beq @nosong
    rep #$20
    lda seq_acc
    clc
    adc #50
    cmp #256
    bcc @acc
    sbc #256
    sta seq_acc
    sep #$20
    jsr audio_step
    bra @nosong
@acc:
    sta seq_acc
    sep #$20
@nosong:
    jsr audio_vibrato
    jsr audio_sweeps
    jsr audio_roar
    rts

; ---------------------------------------------------------------------------
; One sixteenth of the song
audio_step:
    .a8
    .i16
    stz kon_m
    stz kof_m
    ; notes whose time is up
    lda ctr_l
    beq @cl
    dec ctr_l
    bne @cl
    lda kof_m
    ora #$01
    sta kof_m
    stz vib_on
@cl:
    lda ctr_r
    beq @cr
    dec ctr_r
    bne @cr
    lda kof_m
    ora #$06
    sta kof_m
@cr:
    lda ctr_b
    beq @cb
    dec ctr_b
    bne @cb
    lda kof_m
    ora #$08
    sta kof_m
@cb:
    ; --- the lead guitar: only while you're riding
    ldx seq_pos
    lda mode
    cmp #M_RUN
    bne @nolead
    lda f:sq_lead_v,x
    beq @nolead
    sta av
    lda f:sq_lead_i,x
    rep #$20
    and #$00FF
    asl
    tay
    lda pt_lead,y
    sta ap
    sep #$20
    lda ap
    ldy #$02
    jsr apoke
    lda ap+1
    ldy #$03
    jsr apoke
    lda av
    ldy #$00
    jsr vol2
    ldx seq_pos
    lda f:sq_lead_l,x
    sta tmp0
    and #$7F
    sta ctr_l
    lda tmp0
    and #$80
    sta vib_on
    stz vib_t
    rep #$20
    lda ap
    sta vib_base
    sep #$20
    lda kon_m
    ora #$01
    sta kon_m
@nolead:
    ; --- the two rhythm guitars
    ldx seq_pos
    lda f:sq_rg_v,x
    bne :+
    jmp @norg
:
    ldy mus_shift
    beq @rgv
    lsr
@rgv:
    sta av
    lda f:sq_rg_i,x
    rep #$20
    and #$00FF
    asl
    tay
    lda pt_chord,y
    sta ap
    sep #$20
    ; left guitar
    lda ap
    ldy #$12
    jsr apoke
    lda ap+1
    ldy #$13
    jsr apoke
    lda av
    lsr
    lsr
    sta tmp0
    lda av
    sec
    sbc tmp0                ; 0.75 of it on its own side ...
    ldy #$10
    jsr apoke
    lda av
    lsr
    lsr
    lsr
    ldy #$11
    jsr apoke               ; ... and an eighth on the other
    ; right guitar: a hair sharp
    rep #$20
    lda ap
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    clc
    adc ap
    sta ap
    sep #$20
    lda ap
    ldy #$22
    jsr apoke
    lda ap+1
    ldy #$23
    jsr apoke
    lda av
    lsr
    lsr
    lsr
    ldy #$20
    jsr apoke
    lda av
    lsr
    lsr
    sta tmp0
    lda av
    sec
    sbc tmp0
    ldy #$21
    jsr apoke
    ldx seq_pos
    lda f:sq_rg_l,x
    and #$7F
    sta ctr_r
    lda kon_m
    ora #$06
    sta kon_m
@norg:
    ; --- the bass
    ldx seq_pos
    lda f:sq_bs_v,x
    beq @nobs
    ldy mus_shift
    beq @bv
    lsr
@bv:
    sta av
    lda f:sq_bs_i,x
    rep #$20
    and #$00FF
    asl
    tay
    lda pt_bass,y
    sta ap
    sep #$20
    lda ap
    ldy #$32
    jsr apoke
    lda ap+1
    ldy #$33
    jsr apoke
    lda av
    ldy #$30
    jsr vol2
    ldx seq_pos
    lda f:sq_bs_l,x
    sta ctr_b
    lda kon_m
    ora #$08
    sta kon_m
@nobs:
    ; --- the kit
    ldx seq_pos
    lda f:sq_kick,x
    beq @nok
    ldy mus_shift
    beq @kv
    lsr
@kv:
    ldy #$40
    jsr vol2
    lda kon_m
    ora #$10
    sta kon_m
@nok:
    ldx seq_pos
    lda f:sq_snare,x
    beq @nos
    ldy mus_shift
    beq @sv
    lsr
@sv:
    ldy #$50
    jsr vol2
    lda kon_m
    ora #$20
    sta kon_m
@nos:
    ldx seq_pos
    lda f:sq_hat,x
    beq @noh
    sta tmp0
    lsr
    lsr
    lsr
    lsr
    lsr                     ; 1 closed, 2 open, 3 ride, 4 cymbal
    rep #$20
    and #$00FF
    asl
    tax
    sep #$20
    lda hat_src,x
    ldy #$64
    jsr apoke
    lda hat_a1,x
    ldy #$65
    jsr apoke
    lda hat_a2,x
    ldy #$66
    jsr apoke
    lda tmp0
    and #$1F
    sta tmp0
    lsr
    clc
    adc tmp0
    ldy mus_shift
    beq @hv
    lsr
@hv:
    ldy #$60
    jsr vol2
    lda kon_m
    ora #$40
    sta kon_m
@noh:
    ; --- toms (voice 7 is theirs unless an effect has it)
    ldx seq_pos
    lda v7_busy
    bne @notom
    lda f:sq_tom_v,x
    beq @notom
    sta av
    lda f:sq_tom_i,x
    rep #$20
    and #$00FF
    asl
    tay
    lda tom_pitch,y
    sta ap
    sep #$20
    POKE $74, SRC_KICK
    POKE $75, $FF
    POKE $76, $E0
    lda ap
    ldy #$72
    jsr apoke
    lda ap+1
    ldy #$73
    jsr apoke
    lda av
    ldy mus_shift
    beq @tv
    lsr
@tv:
    ldy #$70
    jsr vol2
    lda kon_m
    ora #$80
    sta kon_m
    lda #28
    sta v7_busy
    stz roar_t
@notom:
    ; --- let the old notes go, then play the new ones
    lda kof_m
    and kon_m
    eor kof_m               ; keep key-offs only for voices that aren't being struck again
    beq @nokof
    sta kof_m
    ldy #$5C
    jsr apoke
    lda #1
    sta kof_pend
@nokof:
    lda kon_m
    beq @nokon
    ldy #$4C
    jsr apoke
@nokon:
    ; next sixteenth, round again at the end
    rep #$20
    inc seq_pos
    lda seq_pos
    cmp #NSTEP
    bcc @np
    lda #LOOP_STEP
    sta seq_pos
@np:
    sep #$20
    rts

; hat voice: sample, ADSR1, ADSR2 for (none), closed, open, ride, cymbal
hat_src: .byte 0, 0, SRC_HAT, 0, SRC_HAT, 0, SRC_RIDE, 0, SRC_HAT, 0
hat_a1:  .byte 0, 0, $FF, 0, $FF, 0, $DF, 0, $BF, 0
hat_a2:  .byte 0, 0, $1F, 0, $7A, 0, $3C, 0, $54, 0

; ---------------------------------------------------------------------------
; The lead guitar's vibrato on long notes: 5.4 a second, 0.8% deep, fading in
audio_vibrato:
    .a8
    .i16
    lda vib_on
    bne :+
    jmp @r
:
    lda mode
    cmp #M_RUN
    bne @r
    inc vib_t
    lda vib_t
    asl
    asl
    asl
    clc
    adc vib_t
    clc
    adc vib_t               ; 5.4 Hz at 60 frames a second: ~23 of 256 a frame
    adc vib_t
    adc vib_t               ; (the above is 11*t; close enough for a slow wobble)
    rep #$20
    and #$00FF
    asl
    tax
    lda sin16,x
    sta tmp1
    lda vib_base
    sta tmp0
    jsr mulm7               ; base * sin / 256
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror                     ; ~ base * sin / 4096: the depth
    sta tmp2
    sep #$20
    lda vib_t
    cmp #8
    bcs @d1
    rep #$20
    lda tmp2
    cmp #$8000
    ror
    cmp #$8000
    ror
    sta tmp2
    sep #$20
    bra @go
@d1:
    cmp #16
    bcs @go
    rep #$20
    lda tmp2
    cmp #$8000
    ror
    sta tmp2
    sep #$20
@go:
    rep #$20
    lda vib_base
    clc
    adc tmp2
    sta ap
    sep #$20
    lda ap
    ldy #$02
    jsr apoke
    lda ap+1
    ldy #$03
    jsr apoke
@r:
    rts

; ---------------------------------------------------------------------------
; Sweeps: voice 7's noise (the effects), and the lead's dive when you wipe out
audio_sweeps:
    .a8
    .i16
    lda v7_busy
    beq @nov7
    lda v7_t
    beq @nosw
    dec v7_t
    rep #$20
    lda v7_p
    clc
    adc v7_dp
    sta v7_p
    sep #$20
    lda v7_p
    ldy #$72
    jsr apoke
    lda v7_p+1
    ldy #$73
    jsr apoke
@nosw:
    dec v7_busy
@nov7:
    lda leap2_t
    beq @nol
    dec leap2_t
    bne @nol
    ; the second splash of a leap
    stz v7_t
    POKE $74, SRC_ROAR
    POKE $75, $BF
    POKE $76, $92
    POKE $70, $34
    POKE $71, $34
    rep #$20
    lda #16000
    sta v7_p
    lda #$FEE2              ; -286
    sta v7_dp
    sep #$20
    lda v7_p
    ldy #$72
    jsr apoke
    lda v7_p+1
    ldy #$73
    jsr apoke
    POKE $4C, $80
    lda #60
    sta v7_busy
    sta v7_t
@nol:
    ; the whammy-bar dive
    lda dive_t
    beq @r
    dec dive_t
    cmp #70
    bcs @r                  ; (waits a few frames first)
    rep #$20
    lda dive_p
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    sta tmp0
    lda dive_p
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    lsr
    clc
    adc tmp0
    sta tmp0
    lda dive_p
    sec
    sbc tmp0
    sta dive_p
    sep #$20
    lda dive_p
    ldy #$02
    jsr apoke
    lda dive_p+1
    ldy #$03
    jsr apoke
@r:
    rts

; the roar of the barrel, under everything, whenever voice 7 isn't busy
audio_roar:
    .a8
    .i16
    lda v7_busy
    bne @r
    lda roar_t
    bne @upd
    lda seq_on
    beq @r2
@go:
    POKE $74, SRC_ROAR
    POKE $75, $FF
    POKE $76, $E0
    POKE $72, $00
    POKE $73, $10
    lda #1
    sta roar_t
    jsr roar_vol
    POKE $4C, $80
    rts
@r2:
    lda roar_t
    bne @upd
    bra @go
@upd:
    lda frame
    and #$0F
    bne @r
    jsr roar_vol
@r:
    rts
roar_vol:
    .a8
    .i16
    lda qpf
    lsr
    lsr
    lsr
    lsr
    lsr
    clc
    adc #6                  ; louder the faster you go
    ldy #$70
    jsr vol2
    rts

; ---------------------------------------------------------------------------
; Sound effects, on voice 7: src, adsr1, adsr2, volume, frames, pitch, pitch change a frame
sfx_tab:
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0                 ; 0: none
    .byte SRC_MID, $BF, $B4, $2A, 60, <1000, >1000, <108, >108   ; 1: drop in: a rising hiss
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0                 ; 2: the crash, below
    .byte SRC_MID, $DF, $76, $18, 21, <1500, >1500, <214, >214   ; 3: an air
    .byte SRC_ROAR, $DF, $5C, $30, 24, <16000, >16000, <(-496 & $FFFF), >(-496 & $FFFF) ; 4: landing
    .byte SRC_ROAR, $BF, $92, $38, 36, <12000, >12000, <(-289 & $FFFF), >(-289 & $FFFF) ; 5: a shark leaps
    .byte SRC_MID, $DF, $76, $28, 27, <12000, >12000, <(-370 & $FFFF), >(-370 & $FFFF)  ; 6: a near miss

sfx_start:
    .a8
    .i16
    cmp #2
    bne @plain
    jmp crash_start
@plain:
    pha
    rep #$20
    and #$00FF
    sta tmp0
    asl
    asl
    asl
    clc
    adc tmp0
    clc
    adc tmp0
    clc
    adc tmp0
    clc
    adc tmp0                ; * 13
    tax
    sep #$20
    lda sfx_tab,x
    bne :+
    jmp @none
:
    ldy #$74
    jsr apoke
    lda sfx_tab+1,x
    ldy #$75
    jsr apoke
    lda sfx_tab+2,x
    ldy #$76
    jsr apoke
    lda sfx_tab+3,x
    sta av
    lda sfx_tab+4,x
    sta v7_t
    sta v7_busy
    rep #$20
    lda sfx_tab+5,x
    sta v7_p
    lda sfx_tab+7,x
    sta v7_dp
    sep #$20
    lda v7_p
    ldy #$72
    jsr apoke
    lda v7_p+1
    ldy #$73
    jsr apoke
    ; a near miss goes by on the side it was on
    pla
    pha
    cmp #6
    bne @mid
    lda snd_arg
    beq @left
    lda av
    lsr
    ldy #$70
    jsr apoke
    lda av
    ldy #$71
    jsr apoke
    bra @key
@left:
    lda av
    ldy #$70
    jsr apoke
    lda av
    lsr
    ldy #$71
    jsr apoke
    bra @key
@mid:
    lda av
    ldy #$70
    jsr vol2
@key:
    stz roar_t
    POKE $4C, $80
    pla
    cmp #5
    bne @r
    lda #78
    sta leap2_t
    rts
@none:
    pla
@r:
    rts

; the splash, and the band falls apart: one last chord ringing, a cymbal, a kick, the lead diving
; off the end of the whammy bar, and then only the sea
crash_start:
    .a8
    .i16
    stz seq_on
    POKE $5C, $FF
    lda #1
    sta kof_pend
    lda #2
    sta crash_t
    stz vib_on
    stz ctr_l
    stz ctr_r
    stz ctr_b
    rts

crash_notes:
    .a8
    .i16
    ; the sea
    POKE $74, SRC_ROAR
    POKE $75, $BF
    POKE $76, $92
    POKE $70, $52
    POKE $71, $52
    POKE $72, $FF
    POKE $73, $3F
    rep #$20
    lda #$3FFF
    sta v7_p
    lda #$FF55              ; -171
    sta v7_dp
    sep #$20
    lda #90
    sta v7_t
    sta v7_busy
    stz roar_t
    ; the chord, E2, open, both guitars
    rep #$20
    lda pt_chord+96
    sta ap
    sep #$20
    lda ap
    ldy #$12
    jsr apoke
    lda ap+1
    ldy #$13
    jsr apoke
    lda ap
    ldy #$22
    jsr apoke
    lda ap+1
    ldy #$23
    jsr apoke
    POKE $10, $2C
    POKE $11, $0C
    POKE $20, $0C
    POKE $21, $2C
    ; a cymbal and a kick
    POKE $64, SRC_HAT
    POKE $65, $BF
    POKE $66, $54
    POKE $60, $34
    POKE $61, $34
    POKE $40, $60
    POKE $41, $60
    ; the lead, E4, on its way off the end of the whammy bar
    rep #$20
    lda pt_lead+144
    sta ap
    sta dive_p
    sep #$20
    lda ap
    ldy #$02
    jsr apoke
    lda ap+1
    ldy #$03
    jsr apoke
    POKE $00, $30
    POKE $01, $30
    lda #82
    sta dive_t
    POKE $4C, $F7
    rts
