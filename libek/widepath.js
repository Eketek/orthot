export { WidePath }

import { rad_tosector } from './libek.js'
import { flatten } from './util.js'

/*
  Wide-path rendering utility
  
  A wide path is a set of aligned one pixel wide paths drawn along a main path.
  The main path is drawn using Bresenham's line drawing algorithm.  All other subpaths are parallel paths which are vertically/horizontally offset by some 
  amount of pixels from the main path (a subpath occupies all pixels which are orthogonally adjacent in some direction to another subpath)  
  Each subpath may have its own color.  
    
  Ostensibly, this is intended for drawing GUI components to a Canvas.  However, the actual impetus for it is broader design goals (desire for a 
    reasonably sophisticated generative art system) - otherwise orthot would get only an overhaul to its HTML-based GUI.
    
  WideLine is divided into three distinct components.  
  
  The first is WlPath - a data structure which represents any number of strokes
    
  Usage:
    1.  Instantiate WlPath
    2.  Add strokes (Each stroke is transformed into a list of fragments and added to WlPath)
    3.  Render (this takes data from WlPath and uses a color map to write it to a Canvas/ImageData)
  
  The separation of functionality is intended to aid in re-using intermediate products.
  
*/


var plot = function(vtA, vtB) {
  let points = []
  
  
  return [points, orientation]
}

/*  WidePath Constructor

    imgWidth:   pixel width of the rendering target
    imgHeight:  pixel height of the rendering target
    neg:        Maximum number of subpaths to the right of the main path
    pos:        Maximum number of subpaths to the left of the main path
*/
var WidePath = function(imgWidth, imgHeight, neg=0, pos=0) {

  let neg_shims = 0
  if (neg < pos) {
    neg_shims = pos - neg
  }
  let pos_shims = 0
  if (pos < neg) {
    pos_shims = neg - pos
  }
  
  let thick = Math.max(neg, pos)
  
  let numLines = 1+thick*2
  let baseLineval = 1+thick
  
  let strokes = []
  
  // depth buffer to help combine intersecting strokes  
  //  (main sub-path and those immediately surrounding it are treated as on a higher layer than subpaths further out when multiple strokes cover the same pixel)
  let dbuf = Array(imgWidth*imgHeight).fill(0)

  /*  Add a stroke to the WidePath.
    
      All strokes are rendered with the same common properties and the same depth buffer - If two strokes intersect, the distance from the main subpath is used
      as the depth of each pixel (this is the only reason for multistroke capability)
      
      Input is a list of vertices.  The list may be either an Array or a list of args
      Vertices are accepted in any combonation of these formats:
        Object with numeric 'x' and a 'y' {x:X, y:Y}
        Array containing two numeric elements [x,y]
        Even-length list of numeric coordinate pairs: [x1, y1, x2, y2, ...]
      
  */
  this.addStroke = function(... vertices) {
    let _vertices = flatten(vertices)
    vertices = []
    for (let i = 0; i < _vertices.length; i++) {
      let entry = _vertices[i]
      if (typeof(entry) == "number") {
        vertices.push({x:entry, y:_vertices[i+1]})
        i++
      }
      else {
        vertices.push(entry)
      }
    }
    
    var w = imgWidth
    var h = imgHeight
    
    let fragments = []
    strokes.push(fragments)
    
    let step = 0
    
    let prev_orientation = undefined
    let prev_angle = undefined
    let angle = 0
    
    let orientation = 0
    
    let shim_fragments0 = []
    let shim_fragments1 = []
    let shim_fragments2 = []
    
    let fbuf = Array(imgWidth*imgHeight)
    for (let segnum = 0; segnum < vertices.length-1; segnum++) {
      shim_fragments0 = shim_fragments1
      shim_fragments1 = shim_fragments2
      shim_fragments2 = []
      
      // extract a pair of [base] vertices to plot a line between
      let vtA = vertices[segnum]
      let vtB = vertices[segnum+1]
      
      
      // Plot along the base line
      //    Adapted from Wikipedia (https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm)
      let dx = Math.abs(vtB.x - vtA.x)
      let dy = -Math.abs(vtB.y - vtA.y)
      
      // line orientation to assist the outliner
      prev_orientation = orientation
      prev_angle = angle
      angle = Math.atan2(vtB.y - vtA.y, vtB.x - vtA.x)
      let sector = rad_tosector(angle, 8)
      orientation = Math.floor(((sector+1)%8)/2)
      
      if (segnum == 0) {
        let veB = vertices[vertices.length-1]
        if ( (veB.x == vtA.x) && (veB.y == vtA.y) ) {
          let veA = vertices[vertices.length-2]
          prev_angle = Math.atan2(veB.y - veA.y, veB.x - veA.x)
          let sectorE = rad_tosector(prev_angle, 8)
          prev_orientation = Math.floor(((sectorE+1)%8)/2)
        }
      }
      let sharp = false
      let adiff = angle-prev_angle
      if (adiff < -Math.PI) {
        adiff += Math.PI*2
      }
      let pos_interior = adiff >= 0
      
      // effective depth boost to force the depth sorter to favor the interior of sharp angles, without substantially breaking the shader-like behavior
      //    (this is a hack - it replaces an obvious game-breaking glitch with a much more subtle one, or so I supopose)
      let neg_boost = 0
      let pos_boost = 0
      
      
      // For vertices:
      // if a sharp angle, draw a 180 degree cap
      // if a median angle, draw a 90 degree cap
      // ignore wide angles (the cap would get completely overwritten)
      if ( (orientation != prev_orientation) && (prev_orientation != undefined) ) {
        let vincr = 1  // positive
        let lim = pos_interior ? pos : neg
        switch(orientation-prev_orientation) {
          case 3:
          case -1:
            vincr = -1
            lim = neg
          break
          case 2:
          case -2:
            sharp = true
            if (pos_interior) {
              pos_boost = 1
            }
            else {
              vincr = -1
              neg_boost = 1
            }
            break
        }
        
        if (sharp) {
          switch(prev_orientation) {
            case 0:
              for (let i = 1; i <= thick; i++) {
                let lineval = baseLineval + vincr*i
                let linedepth = baseLineval - i
                for (let j = 0; j <= i; j++) {
                  let x = vtA.x + j
                  let y = vtA.y + i - j
                  if (i <= lim) {
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                    y = vtA.y - i + j
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                  }
                  else {
                    let k = x+y*w
                    if (linedepth > dbuf[k]) {
                      dbuf[k] = linedepth
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                    y = vtA.y - i + j
                    k = x+y*w
                    if (linedepth > dbuf[k]) {
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                  }
                }
              }
            break
            case 2:
              for (let i = 1; i <= thick; i++) {
                let lineval = baseLineval + vincr*i
                let linedepth = baseLineval - i
                for (let j = 0; j <= i; j++) {
                  let x = vtA.x - j
                  let y = vtA.y + i - j
                  if (i <= lim) {
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                    y = vtA.y - i + j
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                  }
                  else {
                    let k = x+y*w
                    if (linedepth > dbuf[k]) {
                      dbuf[k] = linedepth
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                    y = vtA.y - i + j
                    k = x+y*w
                    if (linedepth > dbuf[k]) {
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                  }
                }
              }
            break
            case 1:
              for (let i = 1; i <= thick; i++) {
                let lineval = baseLineval + vincr*i
                let linedepth = baseLineval - i
                for (let j = 0; j <= i; j++) {
                  let x = vtA.x + j
                  let y = vtA.y + i - j
                  if (i <= lim) {
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                    x = vtA.x - j
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                  }
                  else {
                    let k = x+y*w
                    if (linedepth > dbuf[k]) {
                      dbuf[k] = linedepth
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                    x = vtA.x - j
                    k = x+y*w
                    if (linedepth > dbuf[k]) {
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                  }
                }
              }
            break
            case 3:
              for (let i = 1; i <= thick; i++) {
                let lineval = baseLineval + vincr*i
                let linedepth = baseLineval - i
                for (let j = 0; j <= i; j++) {
                  let x = vtA.x + j
                  let y = vtA.y - i + j
                  if (i <= lim) {
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                    x = vtA.x - j
                    if (linedepth > dbuf[x+y*w]) {
                      dbuf[x+y*w] = linedepth
                      fragments.push([x,y,lineval,segnum,step])
                    }
                  }
                  else {
                    let k = x+y*w
                    if (linedepth > dbuf[k]) {
                      dbuf[k] = linedepth
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                    x = vtA.x - j
                    k = x+y*w
                    if (linedepth > dbuf[k]) {
                      shim_fragments2.push([x,y,linedepth])
                      if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                        fbuf[k][3] = -1
                        dbuf[k] = 0
                      }
                    }
                  }
                }
              }
            break
          }
        }
        else {
          let xincr = 0
          let yincr = 0
          switch(prev_orientation) {
            case 0:
              xincr = 1
              break
            case 2:
              xincr = -1
              break
            case 1:
              yincr = 1
              break
            case 3:
              yincr = -1
              break
          }
          switch(orientation) {
            case 0:
              xincr = -1
              break
            case 2:
              xincr = 1
              break
            case 1:
              yincr = -1
              break
            case 3:
              yincr = 1
              break
          }
          for (let i = 1; i <= thick; i++) {
            let lineval = baseLineval + vincr*i
            let linedepth = baseLineval
            for (let j = 0; j <= i; j++) {
              let x = vtA.x + j * xincr
              let y = vtA.y + (i - j)*yincr
              let k = x+y*w
              if (i <= lim) {
                if (linedepth > dbuf[k]) {
                  dbuf[k] = linedepth
                  fragments.push([x,y,lineval,segnum,step])
                }
              }
              else {
                if (linedepth > dbuf[k]) {
                  dbuf[k] = linedepth
                  shim_fragments2.push([x,y,linedepth])
                  if (fbuf[k] && (fbuf[k][3] == (segnum-1))) {
                    fbuf[k][3] = -1
                    dbuf[k] = 0
                  }
                }
              }
            }
          }
        }
        
      }
      
      let sx = vtA.x<vtB.x ? 1 : -1
      let sy = vtA.y<vtB.y ? 1 : -1
      
      let err = dx+dy
      
      let x = vtA.x
      let y = vtA.y
      
      while(true) {
        // plot x,y
        if (baseLineval > dbuf[x+y*w]) {
          dbuf[x+y*w] = baseLineval
          fragments.push([x,y,baseLineval,segnum,step,angle])
          neg_boost = 0
          pos_boost = 0
        }
        
        switch(orientation) {
          case 0:
            if ((x >= 0) && (x<w)) {
              for (let i = 1; i <= thick; i++) {
                let _y = y+i
                let lineval = baseLineval-i
                let linedepth = baseLineval-i
                if ((_y >= 0) && ((linedepth + neg_boost) > dbuf[x+_y*w])) {
                  let j = x+_y*w
                  dbuf[j] = linedepth
                  if (i <= neg) {
                    let frag = [x,_y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([x,_y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
              for (let i = 1; i <= thick; i++) {
                let _y = y-i
                let lineval = baseLineval+i
                let linedepth = baseLineval-i
                if ((_y < h) && ((linedepth + pos_boost) > dbuf[x+_y*w])) {
                  let j = x+_y*w
                  dbuf[j] = linedepth
                  if (i <= pos) {
                    let frag = [x,_y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([x,_y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
            }
          break
          case 2:
            if ((x >= 0) && (x<w)) {
              for (let i = 1; i <= thick; i++) {
                let _y = y-i
                let lineval = baseLineval-i
                let linedepth = baseLineval-i
                if ((_y >= 0) && ((linedepth + neg_boost) > dbuf[x+_y*w])) {
                  let j = x+_y*w
                  dbuf[j] = linedepth
                  if (i <= neg) {
                    let frag = [x,_y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([x,_y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
              for (let i = 1; i <= thick; i++) {
                let _y = y+i
                let lineval = baseLineval+i
                let linedepth = baseLineval-i
                if ((_y < h) && ((linedepth + pos_boost) > dbuf[x+_y*w])) {
                  let j = x+_y*w
                  dbuf[j] = linedepth
                  if (i <= pos) {
                    let frag = [x,_y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([x,_y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
            }
          break
          case 1:
            if ((y >= 0) && (y<h)) {
              for (let i = 1; i <= thick; i++) {
                let _x = x-i
                let lineval = baseLineval-i
                let linedepth = baseLineval-i
                let j = _x+y*w
                if ((_x >= 0) && ((linedepth + neg_boost) > dbuf[j])) {
                  dbuf[j] = linedepth
                  if (i <= neg) {
                    let frag = [_x,y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([_x,y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
              for (let i = 1; i <= thick; i++) {
                let _x = x+i
                let lineval = baseLineval+i
                let linedepth = baseLineval-i
                let j = _x+y*w
                if ((_x < w) && ((linedepth + pos_boost) > dbuf[j])) {
                  dbuf[j] = linedepth
                  if (i <= pos) {
                    let frag = [_x,y,lineval,segnum,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([_x,y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
            }
          break
          case 3:
            if ((y >= 0) && (y<h)) {
              for (let i = 1; i <= thick; i++) {
                let _x = x+i
                let lineval = baseLineval-i
                let linedepth = baseLineval-i
                let j = _x+y*w
                if ((_x >= 0) && ((linedepth + neg_boost) > dbuf[j])) {
                  dbuf[j] = linedepth
                  if (i <= neg) {
                    let frag = [_x,y,lineval,segnum, step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([_x,y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
              for (let i = 1; i <= thick; i++) {
                let _x = x-i
                let lineval = baseLineval+i
                let linedepth = baseLineval-i
                let j = _x+y*w
                if ((_x < w) && ((linedepth + pos_boost) > dbuf[j])) {
                  dbuf[j] = linedepth
                  if (i <= pos) {
                    let frag = [_x,y,lineval,step,angle]
                    fragments.push(frag)
                    fbuf[j] = frag
                  }
                  else {
                    shim_fragments2.push([_x,y,linedepth])
                    if (fbuf[j] && (fbuf[j][3] == (segnum-1))) {
                      fbuf[j][3] = -1
                      dbuf[j] = 0
                    }
                  }
                }
              }
            }
          break
        }
        
        if ((x == vtB.x) && (y == vtB.y)) {
          break
        }
        let e2 = 2*err
        if (e2 >= dy) {
          err += dy
          x += sx
        }
        if (e2 <= dx) {
          err += dx
          y += sy
        }

        step++
        
        for (let sfrag of shim_fragments0) {
          let i = sfrag[0] + sfrag[1]*w
          if (dbuf[i] == sfrag[2]) {
            dbuf[i] = 0
          }
        }
        
      }
    }
    for (let sfrag of shim_fragments2) {
      let i = sfrag[0] + sfrag[1]*w
      if (dbuf[i] == sfrag[2]) {
        dbuf[i] = 0
      }
    }
    for (let sfrag of shim_fragments1) {
      let i = sfrag[0] + sfrag[1]*w
      if (dbuf[i] == sfrag[2]) {
        dbuf[i] = 0
      }
    }
  }

  /* A simple renderer
    This draws each sub-path with a fixed color
      (more advanced renderer might involve using the line angle for a lighting effect, using the step value for patterns, or using some blending
       function)
       
    This may render to a Canvas, a Canvas 2d drawing context, or an ImageData
    
    target:     Canvas, drawing context, or ImageData to render to
    neg_colors: *List of colors to use for subpaths on the right side of main path (ordered from right-most to center/main path position)
    main_color: Color of the center/main sub-path
    pos_colors: *List of colors to use for subpaths on the left side of main path (ordered from center/main path position to left-most)
    
    (*)  If the color lists are larger than the amoutns specified in the constructor, extra colors will be ignored.  
         If less than the constructor amount is specified, the extra subpaths will not be rendered (transparent)
  */
  this.draw = function(target, neg_colors, main_color, pos_colors) {
    let c = -1
    let _colors = [0]
    for (let i = 0; i < neg_shims; i++) {
      _colors.push([0,0,0,0])
    }
    for (let i = 0; i < neg; i++) {
      let color = neg_colors[i]
      if (color == undefined) {
        _colors.push([0,0,0,0])
      }
      else if (typeof(color) == "string") {
        _colors.push(toRGBarray(color))
      }
      else if (Array.isArray(color)) {
        _colors.push(color)
      }
      else {
        _colors.push([color.r, color.g, color.b, (color.a == undefined) ? 255 : color.a ])
      }
    }
    if (main_color == undefined) {
      _colors.push([0,0,0,0])
    }
    else if (typeof(main_color) == "string") {
      _colors.push(toRGBarray(main_color))
    }
    else if (Array.isArray(main_color)) {
      _colors.push(main_color)
    }
    else {
      _colors.push([main_color.r, main_color.g, main_color.b, (main_color.a == undefined) ? 255 : main_color.a ])
    }
    for (let i = 0; i < pos; i++) {
      let color = pos_colors[i]
      if (color == undefined) {
        _colors.push([0,0,0,0])
      }
      else if (typeof(color) == "string") {
        _colors.push(toRGBarray(color))
      }
      else if (Array.isArray(color)) {
        _colors.push(color)
      }
      else {
        _colors.push([color.r, color.g, color.b, (color.a == undefined) ? 255 : color.a ])
      }
    }
    for (let i = 0; i < pos_shims; i++) {
      _colors.push([0,0,0,0])
    }
    
    let imgd, cnv, ctx
    if (target.data) {
      imgd = target
    }
    else if (target.createImageData) {
      ctx = target
      imgd = ctx.createImageData(imgWidth, imgHeight)
    }
    else if (target.getContext) {
      cnv = target
      ctx = target.getContext("2d")
      imgd = ctx.createImageData(imgWidth, imgHeight)
    }
    for (let stroke of strokes) {
      for (let fragment of stroke) {
        let [x, y, val, segnum, step, angle] = fragment
        if (segnum == -1) {
          continue
        }
        let i = (x+y*imgWidth)*4
        let col = _colors[val]
        imgd.data[i] = col[0]
        imgd.data[i+1] = col[1]
        imgd.data[i+2] = col[2]
        imgd.data[i+3] = col[3]
      }
    }
    if (ctx) {
      ctx.putImageData(imgd, 0,0)
    }
  }
}

let pixCNV = $("<canvas>")[0]
pixCNV.width = 1
pixCNV.height = 1
let pixCTX = pixCNV.getContext('2d')

// Convert a color string to an array of RGBA values...
//  by drawing it onto a hidden canvas, then reading the resulting pixel value...
let toRGBarray = function(col) {
  pixCTX.fillStyle = col
  pixCTX.fillRect(0,0,1,1)
  let imgd = pixCTX.getImageData(0,0,1,1)
  return [imgd.data[0], imgd.data[1], imgd.data[2], 255]
}







