; Neverending Tunnel III: Infinity Wave -- for the Super Nintendo.
;
; The barrel is two layers of water. BG1 is the far wall as rings of palette
; phase, drawn with the same off-axis geometry as the browser game and
; streamed towards you by rotating the palette. BG2 is light, added over it
; with colour math. HDMA bends and ripples both, line by line. The creatures
; are sprites, scaled by swapping between sizes; the board's nose and the
; text are BG3.
.p816
.smart +
.include "registers.inc"
.include "vars.inc"

; ---------------------------------------------------------------------------
.segment "CODE"

.macro vram_dma dest, src, size
    lda #$80
    sta VMAIN
    ldx #dest
    stx VMADDL
    lda #$01
    sta DMAP0
    lda #$18
    sta BBAD0
    ldx #.loword(src)
    stx A1T0L
    lda #^src
    sta A1B0
    ldx #size
    stx DAS0L
    lda #$01
    sta MDMAEN
.endmacro

.macro cgram_dma dest, src, size
    lda #dest
    sta CGADD
    stz DMAP0
    lda #<CGDATA
    sta BBAD0
    ldx #.loword(src)
    stx A1T0L
    lda #^src
    sta A1B0
    ldx #size
    stx DAS0L
    lda #$01
    sta MDMAEN
.endmacro

reset:
    sei
    clc
    xce
    jml reset_fast          ; carry on in bank $80, where ROM is fast
reset_fast:
    rep #$38
    ldx #$1FFF
    txs
    lda #$0000
    tcd
    sep #$20
    lda #$80
    pha
    plb                     ; data bank $80 too: registers, RAM and ROM all appear there
    lda #$01
    sta MEMSEL              ; fast ROM
    lda #$8F
    sta INIDISP
    stz NMITIMEN
    stz HDMAEN
    stz MDMAEN

    ; clear all 128K of WRAM
    rep #$10
    ldx #$0000
    stx WMADDL
    stz WMADDH
    lda #$08
    sta DMAP0
    lda #<WMDATA
    sta BBAD0
    ldx #.loword(zero_byte)
    stx A1T0L
    lda #^zero_byte
    sta A1B0
    ldx #$0000
    stx DAS0L
    lda #$01
    sta MDMAEN
    stx DAS0L
    sta MDMAEN

    ; the PPU
    ldx #$33
@clr:
    stz $2100,x
    dex
    bne @clr

    lda #$09
    sta BGMODE              ; mode 1, BG3 on top
    lda #$00
    sta BG1SC               ; BG1 map at word $0000
    lda #$04
    sta BG2SC               ; BG2 map at $0400
    lda #$08
    sta BG3SC               ; BG3 map at $0800
    lda #$51
    sta BG12NBA             ; BG1 tiles at $1000, BG2 tiles at $5000 (words)
    lda #$01
    sta BG34NBA             ; BG3 tiles at $1000
    lda #$83
    sta OBSEL               ; 16/64 sprites, tiles at $6000
    lda #$15
    sta TM                  ; BG1, BG3 and sprites on the main screen
    lda #$02
    sta TS                  ; BG2 is the sub screen: the light that gets added
    lda #$02
    sta CGWSEL              ; colour math adds the sub screen
    lda #$01
    sta CGADSUB             ; to BG1 only
    lda #$20
    sta COLDATA             ; no red in the tint (HDMA sets green and blue)
    rep #$20
    lda #$03FF
    sta vofs1
    sta vofs2
    sta vofs3
    sep #$20
    lda #$FF
    sta BG3VOFS
    lda #$03
    sta BG3VOFS

    ; pictures into VRAM
    vram_dma $1000, bg3_chars, 4096
    vram_dma $1800, bg1_chars, (bg1_chars_end - bg1_chars)
    vram_dma $0000, bg1_map, 2048
    vram_dma $5000, bg2_chars, (bg2_chars_end - bg2_chars)
    vram_dma $0400, bg2_map, 2048
    vram_dma $6000, obj_chars, 16384
    cgram_dma 128, obj_pal, 256

    ; HDMA: BG1, BG2 and BG3 scroll, and the colour tint
    lda #$02
    sta DMAP1
    sta DMAP2
    sta DMAP3
    sta DMAP4
    lda #<BG1HOFS
    sta BBAD1
    lda #<BG2HOFS
    sta BBAD2
    lda #<BG3HOFS
    sta BBAD3
    lda #<COLDATA
    sta BBAD4
    lda #$7E
    sta A1B1
    sta A1B2
    sta A1B3
    lda #^tint_table
    sta A1B4
    ldx #.loword(tint_table)
    stx A1T4L

    ; the table headers: four scanlines a group; data goes in every frame
    ldy #0
@tab:
    ldx table_base,y
    lda #NGROUP
    sta tmp0
@grp:
    lda #$04
    sta hdma_buf,x
    inx
    inx
    inx
    dec tmp0
    bne @grp
    stz hdma_buf,x
    iny
    iny
    cpy #12
    bcc @tab

    ; the foam flecks start spread out along their paths
    rep #$30
    ldx #0
@fp:
    lda foamtab,x
    sta fx,x
    inx
    inx
    cpx #(28*16)
    bcc @fp
    lda #128
    sta prev_n
    sep #$20

    rep #$20
    stz front
    lda #$ACE1
    sta rng
    lda #$0022
    sta qpf
    sep #$20
    lda #$0F
    sta bright

    jsr draw_nose
    jsr enter_title
    jsr build_hdma
    jsr swap_tables
    stz nmi_flag

    lda #$81
    sta NMITIMEN            ; NMI and auto joypad (HDMA is switched on in the NMI)
    lda #$0F
    sta INIDISP

main:
    sep #$20
    rep #$10
    jsr read_pad
    jsr game_update
    jsr apply_shake
    jsr update_tunnel
    jsr audio_tick
    lda frame               ; the ripples and bends are slow: new tables every other frame
    and #$01
    bne @nobuild
    jsr build_hdma
    lda #1
    sta ready               ; the back set is finished; the NMI makes it live
@nobuild:
    jsr oam_begin
    jsr draw_glow
    jsr draw_objects
    jsr draw_foam
    jsr oam_end
@wait:
    lda nmi_flag
    bne @frame
    lda up_state            ; waiting for the next frame: use the time to send the sound program over
    cmp #UP_DONE
    bcs @wait
    jsr audio_pump
    bra @wait
@frame:
    stz nmi_flag
    bra main

table_base: .word 0, 176, 352, HD_SET, HD_SET+176, HD_SET+352

; ---------------------------------------------------------------------------
swap_tables:
    rep #$20
    lda front
    eor #HD_SET
    sta front
    sep #$20
    rts

read_pad:
    .a8
    .i16
@busy:
    lda HVBJOY
    and #$01
    bne @busy
    rep #$20
    lda pad
    sta pad_prev
    lda JOY1L
    sta pad
    eor pad_prev
    and pad
    sta pad_new
    sep #$20
    rts

; wipeouts shake the picture
apply_shake:
    .a8
    .i16
    rep #$20
    lda shake
    beq @none
    lda frame
    and #$0007
    bne @s
    dec shake
@s:
    lda frame
    and #$0001
    beq @neg
    lda #$03FF
    clc
    adc shake
    and #$03FF
    sta vofs1
    sta vofs2
    sep #$20
    rts
@neg:
    .a16
    lda #$03FF
    sec
    sbc shake
    and #$03FF
    sta vofs1
    sta vofs2
    sep #$20
    rts
@none:
    .a16
    lda #$03FF
    sta vofs1
    sta vofs2
    sep #$20
    rts

; advance the ride: position along the barrel and the rotation of the palette
update_tunnel:
    .a8
    .i16
    rep #$20
    inc frame
    lda qpf
    xba
    and #$FF00
    clc
    adc Sf
    sta Sf
    lda Sq
    adc #0
    sta Sq
    ; the palette flows three colours for every quarter radius
    lda qpf
    asl
    clc
    adc qpf
    clc
    adc pal_acc
    sta pal_acc
    sep #$20
    lda pal_acc+1
@red:
    cmp #15
    bcc @ok
    sbc #15
    bra @red
@ok:
    sta pal_acc+1
    rts

.include "gfx.s"
.include "game.s"
.include "audio.s"

; ---------------------------------------------------------------------------
nmi:
    jml nmi_fast
nmi_fast:
    rep #$30
    pha
    phx
    phy
    sep #$20
    lda RDNMI
    lda ready
    beq @noswap
    jsr swap_tables
    stz ready
@noswap:
    ; sprites
    stz OAMADDL
    stz OAMADDH
    stz DMAP0
    lda #<OAMDATA
    sta BBAD0
    rep #$20
    lda #.loword(oam)
    sta A1T0L
    lda #544
    sta DAS0L
    sep #$20
    stz A1B0
    lda #1
    sta MDMAEN

    ; the palettes: the water's colours, rotated by where the rings are
    stz CGADD
    stz DMAP0
    lda #<CGDATA
    sta BBAD0
    lda pal_acc+1
    rep #$20
    and #$00FF
    xba
    clc
    adc #.loword(pal_cycle)
    sta A1T0L
    lda #256
    sta DAS0L
    sep #$20
    lda #^pal_cycle
    sta A1B0
    lda #1
    sta MDMAEN

    ; the text and the board, when they've changed
    lda bg3_dirty
    beq @notext
    stz bg3_dirty
    lda #$80
    sta VMAIN
    rep #$20
    lda #$0800
    sta VMADDL
    sep #$20
    lda #$01
    sta DMAP0
    lda #$18
    sta BBAD0
    rep #$20
    lda #.loword(bg3map)
    sta A1T0L
    lda #2048
    sta DAS0L
    sep #$20
    stz A1B0
    lda #1
    sta MDMAEN
@notext:

    ; the HDMA tables that are live this frame
    rep #$20
    lda front
    clc
    adc #.loword(hdma_buf)
    sta A1T1L
    clc
    adc #176
    sta A1T2L
    clc
    adc #176
    sta A1T3L
    sep #$20
    lda vofs1
    sta BG1VOFS
    lda vofs1+1
    sta BG1VOFS
    lda vofs2
    sta BG2VOFS
    lda vofs2+1
    sta BG2VOFS
    lda bright
    sta INIDISP
    lda #$20
    sta COLDATA             ; no red in the tint, whatever HDMA did last
    lda #$1E
    sta HDMAEN              ; HDMA starts at the top of the frame, never mid-frame
    lda #1
    sta nmi_flag
    rep #$30
    ply
    plx
    pla
    rti

irq:
    rti

; ---------------------------------------------------------------------------
.segment "RODATA"
zero_byte:  .byte 0
path:       .incbin "build/tab_path.bin"
zoff:       .incbin "build/tab_zoff.bin"
kmul:       .incbin "build/tab_k.bin"
wobble:     .incbin "build/tab_wob.bin"
sin16:      .incbin "build/tab_sin16.bin"
recip:      .incbin "build/tab_recip.bin"
scale:      .incbin "build/tab_scale.bin"
foamtab:    .incbin "build/tab_foam.bin"
font_map:   .incbin "build/font_map.bin"
.include "build/frames.inc"
.include "build/text.inc"
.include "build/audio.inc"

.segment "BANK1"
bg1_chars:  .incbin "build/bg1_chars.bin"
bg1_chars_end:
bg1_map:    .incbin "build/bg1_map.bin"

.segment "BANK2"
audio_blob: .incbin "build/audio_blob.bin"
bg2_chars:  .incbin "build/bg2_chars.bin"
bg2_chars_end:
bg2_map:    .incbin "build/bg2_map.bin"
pal_cycle:  .incbin "build/pal_cycle.bin"
tint_table: .incbin "build/tab_tint.bin"
bg3_chars:  .incbin "build/bg3_chars.bin"
obj_pal:    .incbin "build/obj_pal.bin"

.segment "BANK3"
obj_chars:  .incbin "build/obj_chars.bin"

; ---------------------------------------------------------------------------
.segment "HEADER"
    .res 16, 0                              ; $FFB0: maker, game code, ...
    .byte "NEVERENDING TUNNEL 3"            ; $FFC0: title, 21 bytes
    .byte " "
    .byte $30                               ; LoROM, fast
    .byte $00                               ; no extra chips
    .byte $07                               ; 128K
    .byte $00                               ; no SRAM
    .byte $01                               ; North America
    .byte $33
    .byte $00                               ; version
    .word $0000, $0000                      ; checksum complement, checksum (patched)
    .word 0, 0                              ; $FFE0
    .word 0                                 ; native COP
    .word 0                                 ; native BRK
    .word 0                                 ; native ABORT
    .word .loword(nmi)                      ; native NMI
    .word 0                                 ; (reset)
    .word .loword(irq)                      ; native IRQ
    .word 0, 0                              ; $FFF0
    .word 0                                 ; emulation COP
    .word 0
    .word 0                                 ; emulation ABORT
    .word .loword(irq)                      ; emulation NMI
    .word .loword(reset)                    ; emulation RESET
    .word .loword(irq)                      ; emulation IRQ/BRK
