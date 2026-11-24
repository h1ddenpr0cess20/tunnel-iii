; Graphics: the tunnel's HDMA tables, sprites, text.

; ---------------------------------------------------------------------------
; the HDMA tables for the next frame: for every group of four lines, how far
; the barrel is bent there, plus a different ripple in each layer
build_hdma:
    .a8
    .i16
    rep #$30
    lda front
    eor #HD_SET
    sta tb                  ; the back set
    ; where the barrel is, and where it'll be six radii on. The camera looks
    ; that way, so only the curve shows
    lda Sq
    and #$07FF
    asl
    tax
    lda path,x
    sta P0
    lda Sq
    clc
    adc #24
    and #$07FF
    asl
    tax
    lda path,x
    sec
    sbc P0
    sta tmp0
    lda #73
    sta tmp1
    jsr mulm7
    sta Cc

    ; the two ripples run along the groups at their own rates
    lda frame
    asl
    asl
    and #$01FE
    sta w1i
    lda frame
    asl
    sta tmp0
    asl
    clc
    adc tmp0
    clc
    adc #64
    and #$01FE
    sta w2i

    ldx #0
@g:
    lda Sq
    clc
    adc zoff,x
    and #$07FF
    asl
    tay
    lda path,y
    sec
    sbc P0
    asl
    asl
    sta tmp0
    lda kmul,x
    sta tmp1
    jsr mulm7
    sec
    sbc Cc
    sta bend,x              ; sideways bend here, in pixels (the sprites follow it)
    eor #$FFFF
    inc a
    sta tmp0                ; and the scroll that gives it

    lda w1i                 ; BG1 ripple
    clc
    adc #10
    and #$01FE
    sta w1i
    tay
    lda tmp0
    sec
    sbc wobble,y
    and #$03FF
    ldy tb
    sta hdma_buf+1,y

    lda w2i                 ; BG2 ripples differently
    clc
    adc #14
    and #$01FE
    sta w2i
    tay
    lda tmp0
    sec
    sbc wobble,y
    and #$03FF
    ldy tb
    sta hdma_buf+177,y

    iny
    iny
    iny
    sty tb
    inx
    inx
    cpx #(NGROUP*2)
    bcs @done
    jmp @g
@done:
    ; the board's nose leans with the carve: a shear, strongest at its tip
    rep #$30
    lda front
    eor #HD_SET
    clc
    adc #(352 + 1 + 40*3)
    tay                     ; BG3 table, group 40 onwards (scanline 160)
    ldx #15
@nose:
    lda bank
    asl
    asl
    asl
    asl
    asl
    sta tmp0                ; bank * 32, so mulm7's divide by 256 leaves bank * x / 8
    stx tmp1
    jsr mulm7
    eor #$FFFF
    inc a
    and #$03FF
    sta hdma_buf,y
    iny
    iny
    iny
    dex
    bpl @nose
    sep #$20
    rts

; ---------------------------------------------------------------------------
; Sprites. oam is the shadow of OAM, oamx holds each sprite's two extra bits.
oam_begin:
    .a8
    .i16
    stz oam_n
    rts

oam_end:
    .a8
    .i16
    ; sprites that were up last frame and aren't now go off the screen
    lda oam_n
    rep #$20
    and #$00FF
    tay
    asl
    asl
    tax
    sep #$20
@h:
    cpy prev_n
    bcs @hd
    lda #$F0
    sta oam+1,x
    lda #0
    sta oamx,y
    inx
    inx
    inx
    inx
    iny
    bra @h
@hd:
    lda oam_n
    rep #$20
    and #$00FF
    sta prev_n
    sep #$20
    ldx #0
    ldy #0
@p:
    lda oamx+3,x
    asl
    asl
    ora oamx+2,x
    asl
    asl
    ora oamx+1,x
    asl
    asl
    ora oamx,x
    sta oam+512,y
    iny
    inx
    inx
    inx
    inx
    cpx #128
    bcc @p
    rts

; put one sprite: sp_x, sp_y (signed, top-left), sp_t tile, sp_a attributes, sp_s 1 if 64x64
put_spr:
    .a8
    .i16
    rep #$20
    lda sp_y
    clc
    adc #64
    cmp #(224+64)
    bcs @skip
    lda sp_x
    clc
    adc #64
    cmp #(256+64)
    bcs @skip
    sep #$20
    lda oam_n
    cmp #128
    bcs @skip8
    rep #$20
    and #$00FF
    tay
    asl
    asl
    tax
    sep #$20
    lda sp_x
    sta oam,x
    lda sp_y
    sec
    sbc #1
    sta oam+1,x
    lda sp_t
    sta oam+2,x
    lda sp_a
    sta oam+3,x
    lda sp_x+1
    and #$01
    sta tmp0
    lda sp_s
    asl
    ora tmp0
    sta oamx,y
    inc oam_n
@skip8:
    rts
@skip:
    sep #$20
    rts

; ---------------------------------------------------------------------------
; A16 = (tmp0 as a signed 16 * low byte of tmp1 as signed 8) >> 8
;
; This uses the PPU's multiplier. Its 16-bit operand is written a byte at a
; time through a latch that BG1's scroll registers *share*, and my HDMA writes
; BG1HOFS every few lines: if one lands between the two bytes, the operand is
; wrong. So multiply by 1 first, and if M7A didn't come out as tmp0, go again.
mulm7:
@retry:
    sep #$20
    lda tmp0
    sta M7A
    lda tmp0+1
    sta M7A
    lda #1
    sta M7B
    nop
    rep #$20
    lda MPYL
    cmp tmp0
    bne @retry
    sep #$20
    lda tmp1
    sta M7B
    nop
    rep #$20
    lda MPYM
    rts

; ---------------------------------------------------------------------------
; Where a thing at angle pj_d (a byte), radius pj_r (0..127), lands on screen,
; given the eye's radius pj_e (0..127) and a scale pj_k (px per radius, x4).
; Gives pj_x, pj_y: offsets from the way out.
project:
    .a8
    .i16
    rep #$20
    lda pj_d
    and #$00FF
    asl
    tax
    lda sin16,x
    asl
    sta tmp0
    lda pj_r
    sta tmp1
    jsr mulm7               ; sin(d) * r, -127..127
    sta tmp2
    lda pj_d
    and #$00FF
    clc
    adc #64
    and #$00FF
    asl
    tax
    lda sin16,x
    asl
    sta tmp0
    lda pj_r
    sta tmp1
    jsr mulm7               ; cos(d) * r
    sec
    sbc pj_e                ; ... minus the eye's own distance from the axis
    cmp #$8000
    ror                     ; half, so it fits in a signed byte
    sta tmp1
    lda pj_k
    sta tmp0
    jsr mulm7               ; K4 * (y/2) / 256
    sta pj_y
    lda tmp2
    sta tmp1
    lda pj_k
    lsr
    sta tmp0
    jsr mulm7               ; K2 * x / 256
    sta pj_x
    sep #$20
    rts

; ---------------------------------------------------------------------------
; Foam flecks streaming out of the light
draw_foam:
    .a8
    .i16
    rep #$30
    ldx #0
@f:
    stx cnt
    lda fx,x
    clc
    adc fx+4,x
    sta fx,x                ; x += vx
    lda fx+2,x
    clc
    adc fx+6,x
    sta fx+2,x              ; y += vy
    lda fx+4,x              ; vx += vx / 16
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    clc
    adc fx+4,x
    sta fx+4,x
    lda fx+6,x
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    cmp #$8000
    ror
    clc
    adc fx+6,x
    sta fx+6,x
    inc fx+12,x
    lda fx,x                ; off the picture? start again at the light
    clc
    adc #15360
    cmp #30720
    bcs @reset
    lda fx+2,x
    clc
    adc #11776
    cmp #23552
    bcs @reset
    bra @draw
@reset:
    lda fx+8,x
    sta fx+4,x
    asl
    asl
    asl
    sta fx,x
    lda fx+10,x
    sta fx+6,x
    asl
    asl
    asl
    sta fx+2,x
    stz fx+12,x
    jmp @next
@draw:
    lda fx+2,x              ; y in pixels
    asl
    xba
    and #$00FF
    cmp #$0080
    bcc @yp
    ora #$FF00
@yp:
    clc
    adc #CY
    sta tmp1
    bmi @next
    cmp #224
    bcs @next
    lsr
    and #$FFFE
    tay
    lda bend,y
    sta tmp2
    lda fx,x                ; x in pixels
    asl
    xba
    and #$00FF
    cmp #$0080
    bcc @xp
    ora #$FF00
@xp:
    clc
    adc tmp2
    clc
    adc #(CX-8)
    sta sp_x
    lda tmp1
    sec
    sbc #8
    sta sp_y
    lda fx+12,x             ; the older, the bigger
    ldy #0
    cmp #26
    bcc @v
    iny
    cmp #44
    bcc @v
    iny
@v:
    sep #$20
    lda fleck_tiles,y
    sta sp_t
    lda fleck_flags,y
    ora #((6<<1)|$30)
    sta sp_a
    stz sp_s
    jsr put_spr
    rep #$30
@next:
    ldx cnt
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    inx
    cpx #(20*16)
    bcs @done
    jmp @f
@done:
    sep #$20
    rts

; the glare of the way out: a dithered glow that pulses a little
draw_glow:
    .a8
    .i16
    rep #$20
    lda bend+((CY/4)*2)
    clc
    adc #(CX-16)
    sta tmp2
    ldx #0
@p:
    rep #$20
    lda glow_dx,x
    and #$00FF
    clc
    adc tmp2
    sta sp_x
    lda glow_dy,x
    and #$00FF
    clc
    adc #(CY-16)
    sta sp_y
    sep #$20
    lda #GLOW_TILE
    clc
    adc glow_dt,x
    sta sp_t
    lda #((6<<1)|$30|GLOW_FLAGS)
    sta sp_a
    stz sp_s
    phx
    jsr put_spr
    plx
    inx
    cpx #4
    bcc @p
    rts
glow_dx: .byte 0, 16, 0, 16
glow_dy: .byte 0, 0, 16, 16
glow_dt: .byte 0, 2, 32, 34

; ---------------------------------------------------------------------------
; The things in the wave, nearest first, so near ones sit on top of far ones
sort_objects:
    .a8
    .i16
    rep #$30
    stz sort_n
    ldx #0
@i:
    stx ob_i
    lda o_type,x
    beq @skip
    lda o_z,x
    sta tmp0
    ldy sort_n
@shift:
    beq @put
    lda order-2,y
    tax
    lda o_z,x
    sec
    sbc tmp0
    bmi @put
    beq @put
    lda order-2,y
    sta order,y
    dey
    dey
    bra @shift
@put:
    lda ob_i
    sta order,y
    inc sort_n
    inc sort_n
@skip:
    ldx ob_i
    inx
    inx
    cpx #(NOBJ*2)
    bcc @i
    sep #$20
    rts

draw_objects:
    .a8
    .i16
    jsr sort_objects
    rep #$20
    stz ob_pc+2             ; (unused slot; k below)
    ldy #0
@k:
    rep #$20
    cpy sort_n
    bcs @done
    phy
    ldx order,y
    sep #$20
    jsr draw_obj
    rep #$10
    ply
    iny
    iny
    bra @k
@done:
    sep #$20
    rts

; X = object index*2
draw_obj:
    .a8
    .i16
    stx ob_i
    rep #$20
    lda o_z,x
    bpl :+
    jmp @out
:
    cmp #$0090
    bcs :+
    jmp @out
:
    cmp #$2C00              ; the perspective tables stop at 44 radii
    bcc :+
    jmp @out
:
    lsr
    lsr
    lsr
    lsr
    and #$FFFE
    tay
    lda recip,y
    sta pj_k
    tya
    lsr
    tay
    sep #$20
    lda scale,y
    sta ob_scale
    stz ob_scale+1
    rep #$20
    lda o_type,x
    and #$00FF
    asl
    tay
    lda t_kind,y
    sta ob_kind
    lda t_mode,y
    sta ob_pc
    ; where round the barrel it is, relative to you
    lda o_ad,x
    sta tmp0
    lda pa
    xba
    and #$00FF
    sta tmp1
    lda tmp0
    sec
    sbc tmp1
    and #$00FF
    sta pj_d
    ; how far from the axis: the wall is 1.0, minus its height
    lda #256
    sec
    sbc o_h,x
    bpl @r1
    lda #0
@r1:
    lsr
    cmp #127
    bcc @r2
    lda #127
@r2:
    sta pj_r
    ; where your eye is: 0.64 from the axis, closer in when you're in the air
    lda h16
    lsr
    lsr
    lsr
    lsr
    lsr
    sta tmp0
    lda #81
    sec
    sbc tmp0
    sta pj_e
    sep #$20
    jsr project
    rep #$20
    ; to the screen
    lda pj_y
    clc
    adc #CY
    sta ob_y
    bmi @bi0
    cmp #224
    bcs @bi1
    lsr
    and #$FFFE
    bra @bi
@bi0:
    lda #0
    bra @bi
@bi1:
    lda #110
@bi:
    tay
    lda bend,y
    clc
    adc pj_x
    clc
    adc #CX
    sta ob_x
    ; which way up, which way it faces
    stz ob_flipv
    stz ob_fliph
    ldx ob_i
    lda o_f,x
    and #$0001
    sta ob_fliph
    lda ob_pc
    bne @nofv
    lda pj_d
    sec
    sbc #64
    cmp #128
    bcs @nofv
    lda #1
    sta ob_flipv
@nofv:
    lda o_type,x
    and #$00FF
    cmp #T_BOARD
    bne @nospin
    lda frame
    lsr
    lsr
    lsr
    and #$0001
    sta ob_fliph            ; a loose board cartwheels
@nospin:
    ; the sprites of this creature at this size
    lda ob_kind
    asl
    asl
    clc
    adc ob_kind
    clc
    adc ob_scale
    asl
    tay
    lda frame_ptrs,y
    sta ob_ptr
    sep #$20
    ldy #1
    lda (ob_ptr),y
    sta ob_box
    stz ob_box+1
    rep #$20
    lda ob_box
    lsr
    sta tmp0
    lda ob_x
    sec
    sbc tmp0
    sta ob_x0
    lda ob_y
    ldx ob_pc
    bne @cen
    ldx ob_flipv
    bne @fv
    sec
    sbc ob_box              ; standing: the base is at the wall point
@fv:
    sta ob_y0
    bra @go
@cen:
    sec
    sbc tmp0
    sta ob_y0
@go:
    sep #$20
    ldy #0
    lda (ob_ptr),y
    sta cnt
    stz cnt+1
    ldy #2
@piece:
    sep #$20
    lda (ob_ptr),y
    sta pc_dx
    stz pc_dx+1
    iny
    lda (ob_ptr),y
    sta pc_dy
    stz pc_dy+1
    iny
    lda (ob_ptr),y
    sta sp_t
    iny
    lda (ob_ptr),y
    sta ob_fl
    iny
    sty tmp3
    lda ob_fl
    and #$02
    sta sp_s
    lsr
    sta sp_s
    ; attributes
    lda ob_kind
    asl
    ora #$30
    sta tmp0
    lda ob_fl
    and #$01
    ora tmp0
    sta tmp0
    lda ob_fliph
    beq @nh
    lda tmp0
    ora #$40
    sta tmp0
@nh:
    lda ob_flipv
    beq @nv
    lda tmp0
    ora #$80
    sta tmp0
@nv:
    lda tmp0
    sta sp_a
    rep #$20
    lda #16
    ldx sp_s
    beq @sz
    lda #64
@sz:
    sta pc_sz
    lda ob_fliph
    beq @px
    lda ob_box
    sec
    sbc pc_sz
    sec
    sbc pc_dx
    sta pc_dx
@px:
    lda ob_flipv
    beq @py
    lda ob_box
    sec
    sbc pc_sz
    sec
    sbc pc_dy
    sta pc_dy
@py:
    lda ob_x0
    clc
    adc pc_dx
    sta sp_x
    lda ob_y0
    clc
    adc pc_dy
    sta sp_y
    sep #$20
    jsr put_spr
    rep #$10
    ldy tmp3
    rep #$20
    dec cnt
    beq :+
    jmp @piece
:
@out:
    sep #$20
    rts

; ---------------------------------------------------------------------------
; Text on BG3. bg3map is a copy of the map, sent to VRAM every frame.
clear_text:
    .a8
    .i16
    lda #1
    sta bg3_dirty
    rep #$20
    ldx #0
@c:
    stz bg3map,x
    inx
    inx
    cpx #(20*64)
    bcc @c
    sep #$20
    rts

; the nose of the board, always there
draw_nose:
    .a8
    .i16
    lda #1
    sta bg3_dirty
    rep #$30
    ldy #0
    ldx #((20*32+13)*2)
@row:
    lda #NOSE_W
    sta tmp0
@col:
    lda nose_map,y
    sta bg3map,x
    iny
    iny
    inx
    inx
    dec tmp0
    bne @col
    txa
    clc
    adc #(64 - NOSE_W*2)
    tax
    cpy #(NOSE_W*NOSE_H*2)
    bcc @row
    sep #$20
    rts

; map offset (bytes) of the cell hud_x, hud_y -> tmp1; the tile attributes for hud_pal -> tmp2
text_cell:
    .a8
    .i16
    lda #1
    sta bg3_dirty
    lda hud_y
    rep #$20
    and #$00FF
    asl
    asl
    asl
    asl
    asl
    sta tmp0
    sep #$20
    lda hud_x
    rep #$20
    and #$00FF
    clc
    adc tmp0
    asl
    sta tmp1
    sep #$20
    lda hud_pal
    rep #$20
    and #$00FF
    xba
    asl
    asl
    ora #$2000              ; above the sprites
    sta tmp2
    sep #$20
    rts

; zero-terminated string at str_ptr, at hud_x, hud_y in palette hud_pal
puts:
    .a8
    .i16
    jsr text_cell
    ldy #0
@l:
    sep #$20
    lda (str_ptr),y
    beq @d
    rep #$20
    and #$007F
    tax
    sep #$20
    lda font_map,x
    rep #$20
    and #$00FF
    ora tmp2
    ldx tmp1
    sta bg3map,x
    inx
    inx
    stx tmp1
    iny
    bra @l
@d:
    rts

; numtmp as five digits at hud_x, hud_y
putnum:
    .a8
    .i16
    jsr text_cell
    rep #$20
    lda tmp1
    clc
    adc #8
    sta tmp1                ; the rightmost digit
    lda numtmp
    sta tmp3
    ldy #5
@d:
    sep #$20
    lda tmp3
    sta WRDIVL
    lda tmp3+1
    sta WRDIVH
    lda #10
    sta WRDIVB
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    rep #$20
    lda RDDIVL
    sta tmp3
    lda RDMPYL
    and #$000F
    inc a                   ; '0' is tile 1
    ora tmp2
    ldx tmp1
    sta bg3map,x
    dex
    dex
    stx tmp1
    dey
    bne @d
    sep #$20
    rts

; the strip of big letters at str_ptr, two rows, at hud_x, hud_y
put_strip:
    .a8
    .i16
    jsr text_cell
    rep #$20
    ldy #0
    lda (str_ptr),y
    sta tmp3                ; width in tiles
    ldy #2
    ldx tmp1
    lda tmp3
    sta tmp0
@a:
    lda (str_ptr),y
    sta bg3map,x
    iny
    iny
    inx
    inx
    dec tmp0
    bne @a
    lda tmp1
    clc
    adc #64
    tax
    lda tmp3
    sta tmp0
@b:
    lda (str_ptr),y
    sta bg3map,x
    iny
    iny
    inx
    inx
    dec tmp0
    bne @b
    sep #$20
    rts

; handy: put the string `s` at x, y in palette p
.macro PUTS sstr, cx, cy, cpal
    lda #.lobyte(cx)
    sta hud_x
    lda #.lobyte(cy)
    sta hud_y
    lda #cpal
    sta hud_pal
    rep #$20
    lda #.loword(sstr)
    sta str_ptr
    sep #$20
    jsr puts
.endmacro

.macro PUTSTRIP sstr, cx, cy
    lda #.lobyte(cx)
    sta hud_x
    lda #.lobyte(cy)
    sta hud_y
    stz hud_pal
    rep #$20
    lda #.loword(sstr)
    sta str_ptr
    sep #$20
    jsr put_strip
.endmacro
