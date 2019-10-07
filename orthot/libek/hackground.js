export { Hackground }

let Hackground = function(canvas) {
  if (canvas.jquery) {
    canvas = canvas[0]
  }
  this.resolution = 32
  this.xOFS = 0
  this.yOFS = 0
  
  let mainCTX = canvas.getContext('2d')
  
  let buf = document.createElement("canvas")
  buf.width = canvas.width+this.resolution*2
  buf.height = canvas.height * 2
  let ctx = buf.getContext('2d')
    
  
  this.layers = [
    [ {
        pos:0,
        color:"black",
        rndRange:0,
        rndCurve:1
      },
      {
        pos:1,
        color:"black",
        rndRange:0,
        rndCurve:1
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
      for (let col = startCOL; col < endCOL; col++) {
        let x1 = col*this.resolution
        let prevPos = 0
        let prevColor = undefined
        let stops = []
        //let grad = ctx.createLinearGradient(0, 0, 150, 150);
        for (let entry of layer) {
          let gen = Math.random
          if (entry.gen) {
            gen = entry.gen
          }
          let pos = (0.5 + entry.pos + (((gen(col+this.offset, numCols) ** entry.rndCurve) * entry.rndRange)*2)-entry.rndRange) * h
          let color = entry.color
          if (pos > prevPos || entry.overdraw) {
            let grad = ctx.createLinearGradient(0, prevPos, 0, pos)
            grad.addColorStop(0, prevColor)
            grad.addColorStop(1, entry.color)
            
            ctx.fillStyle = grad
            ctx.fillRect(x1, prevPos, this.resolution, pos-prevPos+1)
  
            prevPos = pos
          }          
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
    if (this.bkgColor) {
      mainCTX.fillStyle = this.bkgColor
      mainCTX.fillRect(0,0, canvas.width, canvas.height)
    }
    else {
      mainCTX.clearRect(0,0, canvas.width, canvas.height)      
    }
    mainCTX.drawImage(buf, this.xOFS, this.yOFS+canvas.height/2,canvas.width,canvas.height, 0,0,canvas.width,canvas.height)
  }
}



























