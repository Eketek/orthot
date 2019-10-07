export { Hackground }
import { clamp } from './util.js'
//  Paints random gradients onto a canvas
//

let Hackground = function(canvas) {
  if (canvas.jquery) {
    canvas = canvas[0]
  }
  this.resolution = 32
  this.xOFS = 0
  let _yOFS = 0
  
  let minYOFS  = -canvas.height/2
  let maxYOFS  = canvas.height/2
  Object.defineProperty(this, 'yOFS', {
    set: function(val) { 
      _yOFS = clamp(val, minYOFS, maxYOFS)
    } 
  })
  
  let mainCTX = canvas.getContext('2d')
  
  // Use a buffer twice as 
  let buf = document.createElement("canvas")
  buf.width = canvas.width+this.resolution*2
  buf.height = canvas.height * 2
  let ctx = buf.getContext('2d')
    
  
  this.layers = [
    [ {
        pos:0,
        color:"black",
        range:0,
        curve:1
      },
      {
        pos:1,
        color:"black",
        range:0,
        curve:1
      }
    ]
  ]
  this.offset = 0
  
  this.rotate = function(amt) {
    amt += (this.xOFS/this.resolution)
    let ipart = Math.floor(amt)
    let fpart = amt - ipart
    amt = ipart
    this.xOFS = Math.floor(this.resolution * fpart)
    this.offset += amt
    let numCols = Math.floor(buf.width / this.resolution)
    if (numCols * this.resolution < buf.width) {
      numCols += 1
    }
    let reuseAMT = numCols - Math.abs(amt)
    if (reuseAMT <= 0) {
      this.drawAll()
    }
    else {
      let sx, dx
      let w = reuseAMT * this.resolution
      let shiftAMT = Math.abs(amt) * this.resolution
      //left-shift
      if (amt > 0) {
        sx = shiftAMT
        dx = 0
      }
      
      //right-shift
      else {
        sx = 0
        dx = shiftAMT
      }
        
      //void ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
      ctx.drawImage(buf, sx,0,w,buf.height, dx,0,w,buf.height)
      
      //console.log(this.offset, numCols, amt, reuseAMT)
      
      if (amt > 0) {
        this.draw(numCols - amt-1, amt+1) 
      }      
      else {
        this.draw(0, -amt)
      }
      
    }
  }
  
  this.draw = function(startCOL = 0, amount=99999) {
    let numCols = Math.floor(buf.width / this.resolution)
    if (numCols * this.resolution < buf.width) {
      numCols += 1
    }
    let endCOL = startCOL + amount
    if (endCOL > numCols) {
      endCOL = numCols 
    }
    let h = canvas.height
    for (let layer of this.layers) {
      let layerOFS = ( layer.baseOfs != undefined ? layer.baseOfs : 0 )
      let mg = layer.baseGen
      //console.log(layer)
      let mg_range = layer.range != undefined ? layer.range : 0
      let mg_curve = layer.curve != undefined ? layer.curve : 1
      
      let gradGen = layer.gradGen ? layer.gradGen : Math.random
      
      for (let col = startCOL; col < endCOL; col++) {
        let colOFS = layerOFS + (mg ? ((mg(col+this.offset, numCols)**mg_curve)*2*mg_range)-mg_range : 0)
        //colOFS = 0
        //baseOFS = 0
        //console.log(mg)
//        console.log((mg ? ((mg(col+this.offset, numCols)**mg_curve)*2*mg_range)-mg_range : 0))
        let x1 = col*this.resolution
        let prevPos = 0
        let prevColor = undefined
        let stops = []
        //let grad = ctx.createLinearGradient(0, 0, 150, 150);
        for (let entry of layer.gradients) {
          let eg = entry.gen != undefined ? entry.gen : gradGen
          let eg_range = (entry.range != undefined ? entry.range : 0)
          let eg_curve = (entry.curve != undefined ? entry.curve : 1)
          
          //console.log(entry, eg, eg_range, eg_curve)
          
          let pos = (0.5 + colOFS + entry.pos + (((eg(col+this.offset, numCols) ** eg_curve) * eg_range)*2)-eg_range) * h
          let color = entry.color
          if (prevColor && (pos > prevPos || entry.overdraw)) {
            let grad = ctx.createLinearGradient(0, prevPos, 0, pos)
            grad.addColorStop(0, prevColor)
            grad.addColorStop(1, entry.color)
            
            ctx.fillStyle = grad
            ctx.fillRect(x1, prevPos, this.resolution, pos-prevPos+1)
          }          
          prevPos = pos
          if (entry.startColor) {
            prevColor = entry.startColor
          }
          else {
            prevColor = entry.color 
          }
        }
      }
    }
  }
  this.update = function() {
    mainCTX.drawImage(buf, this.xOFS, _yOFS+canvas.height/2,canvas.width,canvas.height, 0,0,canvas.width,canvas.height)
  }
}



























