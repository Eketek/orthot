export { renderCTL, inputCTL, sviewCTL, edCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, releaseAsset, storeAsset, 
  pickAgainstPlane, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { deepcopy, anythingIN, clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'
import { direction, setOrientation, toForward } from '../libek/direction.js'
import { BoxTerrain, DECAL_UVTYPE } from '../libek/gen.js'
import { VxScene } from '../libek/scene.js'
import { plotLine, debugLine } from '../libek/plot.js'

// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = window.rctl = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = window.ictl = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

var edCTL = window.ectl = {
  tiles:{},
  version:"0.1.0",
  event:new EventTarget(),
  assets:{}
}

$(async function MAIN() {

  initLIBEK()

  let disp_elem = $("#editor").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)
  renderCTL.display.renderer.setClearAlpha(1)
  renderCTL.display.renderer.setClearColor("black")
  

  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  try {
    // Asset management - check assets/verison.txt, compare everything with stored version numbers
    //  If the version is old, use fetch option {cache:"reload"} to force a reload of any old data
    //  Otherwise, use default fetch options
    // While so doing, setup an asynchronous download of everything (and wait for everything to be completed)
    //  Should probably run some sort of display hack and show a progress bar while waiting.
    let dver_file = await fetchText("assets/edversion.txt", {cache:"no-store"})
    let lines = dver_file.split('\n')
    let current_versions = {}
    let prev_versions = {}
    for (let line of lines) {
      line = line.trim()
      if (line != '') {
        let parts = line.split(' ')
        current_versions[parts[0]] = 0|parseInt(parts[1])
      }
    }  
    let reloadOPT = { cache:"reload" }
    
    // accepts a property name and loader function, checks the previous known version against the reported current version,
    //  and if the file is indicated to be old, calls the loader function with a forced reload fetch option
    //  (if not old, the call is made with fetch defaults, so as to accept whatever is cached)
    let update = async function(propname, loadit) {
      let curr_ver = current_versions[propname]
      let prev_ver = 0|parseInt(window.localStorage[propname+"EDVER"])
      let result = await loadit((curr_ver > prev_ver) ? reloadOPT : undefined)
      return result
    }
    
    // call each update, but aggregate all the promises
    let promises = [
      update("texture", (fetchOPTS)=>{
        return loadMuch(
          edCTL.assets,
          true,
          fetchOPTS,
          {url:"assets/textures/patterns.png", properties:TextureProps},
          {url:"assets/textures/wall_8bit_fg.png", properties:TextureProps},
          {url:"assets/textures/editoricons.png", properties:TextureProps},
        )
      }),
      update("model", (fetchOPTS)=>{
        return loadZIP(edCTL.assets, true, 'assets/ekvxed2models.zip', fetchOPTS)
      })
    ]
    
    // Whene everything is loaded, update local storage with the versions of the cached files
    await Promise.all(promises)
    console.log("Loaded Ekvxed2 data")
    for (let name in current_versions) {
      window.localStorage[name+"EDVER"] = current_versions[name]
    }
  }
  catch(err) {
    console.log("FAILED to load Ekvxed2 data because:", err)
    return
  }
  /*
  edCTL.tiles.key = {
    source:edCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
  */
  
  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
  
  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:edCTL.assets.wall_8bit_fg,
    bkgtex:edCTL.assets.patterns,
    uv2:renderCTL.uv2,
    roughness:0.76,
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.fg}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.bg1}*bc.g + ${renderCTL.bg2}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })

  let markmats = [
    {color:"green", emissive:"green", emissiveIntensity:0.333}, 
    {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [
    {color:"white", emissive:"white", emissiveIntensity:0.333}, 
    {color:"black", transparent:true, opacity:0.4}]
  let erasecursormats = [
    {color:"white", emissive:"white", emissiveIntensity:0.333}, 
    {color:"black", transparent:true, opacity:0.4}, 
    {color:"red", emissive:"red", emissiveIntensity:0.333}]


  assignMaterials(edCTL.assets.CubeMark, markmats)
  assignMaterials(edCTL.assets.FaceMark, markmats)
  assignMaterials(edCTL.assets.DirCursor, [
    {color:"white", emissive:"white", emissiveIntensity:0.333},
    {color:"black", transparent:true, opacity:0.4},
    {color:"red", emissive:"red", emissiveIntensity:0.333}])
  assignMaterials(edCTL.assets.CubeCursor, cursormats)
  assignMaterials(edCTL.assets.FaceCursor, cursormats)
  assignMaterials(edCTL.assets.EraseCubeCursor, erasecursormats)
  assignMaterials(edCTL.assets.EraseFaceCursor, erasecursormats)
  
  // Split the DirCursor model into a "Simple" and an "Advanced" version.  The advanced version has an extra mark showing the right vector.  The Simple version only shows forward.
  let DirCursor = getAsset(edCTL.assets, "DirCursor")
  let AdvDirCursor = getAsset(edCTL.assets, "DirCursor")
  DirCursor.remove(DirCursor.children[2])
  assignMaterials(DirCursor, [
    {color:"white", emissive:"white", emissiveIntensity:0.333},
    {color:"black", transparent:true, opacity:0.4}])
  assignMaterials(AdvDirCursor, [
    {color:"white", emissive:"white", emissiveIntensity:0.333},
    {color:"black", transparent:true, opacity:0.4},
    {color:"red", emissive:"red", emissiveIntensity:0.333}])
  storeAsset(edCTL.assets, "DirCursor", DirCursor)
  storeAsset(edCTL.assets, "AdvancedDirCursor", AdvDirCursor)
  
  // Generate a nearly opaque dark cube to temporarilly obscure erased objects
  // (while using a click & drag operation to mass-erase blocks, the most recently "erased" blocks are retained for a bit and used to intercept raycasts, 
  //  to prevent click & drag erasing operations from rapidly creating deep holes.  Objects are removed from the display  [along with the "ShadeCube"] 
  //  once there is no need to prevent raycasts from hitting deeper objects -- either because the mouse was released or because the bypass capacity has been
  //  exceeded) 
  let shadeGEOM = new THREE.BoxGeometry( 1.05, 1.05, 1.05 );
  shadeGEOM.translate(0,0.525,0)
  let shadeMAT = new THREE.MeshStandardMaterial({color:"black", transparent:true, opacity:0.8})
  let shadeOBJ = new THREE.Mesh(shadeGEOM, shadeMAT)
  storeAsset(edCTL.assets, "ShadeCube", shadeOBJ)
  
  let pickplane = new THREE.Plane(direction.vector.UP.clone(), 0)
  
  let controlActive = false
  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:edCTL.event,
    pickplane:pickplane,
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    onCamUpdate:function() {
      controlActive = true
    },

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"mmb",

    tpmode_fov:60,
    PickPlane_ArrowkeyController:"wasd arrows",
    subunit:1,
  })
  sviewCTL.run()
  
  // mrayDragPOSs is used by mouse-ray pickmode controller to avoid picking against objects placed during the current click & drag operation
  // The list is initalized when LMB is pressed and reset when LMB is released or if click & drag is cancelled
  //  (This makes click & drag useful for building things more interesting than a chain of blocks pointing directly at the camera)
  let mrayDragPOSs
  //Maximum amount of objects to avoid picking against (if limit is reached, it starts removing the holdest objects in the list)
  let MrayDragLimit = 4
  
  let PICKRAY_LENGTH = 50
  let recentPos = new THREE.Vector3(0,0,0)
  let pickmode = "xz"
  
  
  //Editor-icon PNG:  ectl.assets.editoricons.image 
  //  (loaded through the THREE.js texture loader.  For this purpose, this is equivalent to linking to it with an <img> element)
  
  //  Editor icons are tilesheets.  
  //  There is a general-purpose tilesheet for tools & options which are intended as common (pick mode, copy, paste, move, delete, edit-properties, etc.)
  //  There is a second application-specific tilesheet for the data to operate on (to be provided through a configurer).
  //  Each tile is 48x22 pixels in size.
  //  Each icon has a specific row & column position (in addition to something that indicates whether it is from the general sheet or the application sheet).
  //  These icons are [intended as] a graphics-only representation of the tool.
  
  //  These icons are also to be supplemented with a short/acyonym text representation of the tool to be drawn underneath the icon
  //  The short text should be augmented with a descriptive tooltip 
  //  At some point, these texts should also become localized texts

  //  Background highlighting is to indicate the following UI statuses:
  //    Inactive  (tool not in use)
  //    Active    (tool currently in use)
  //    Inactive + Mouseover
  //    Active + Mouseover
  //    Activating (Active + Mousedown)

  let deactivators = {}

  let addEditorBTN = edCTL.addEditorBTN = function(name, desc, value, init_active, position, activeClass, sheet, row, col, hue, hdev) {
    let $btn = $("<canvas>")
    let cnv = $btn[0]
    cnv.title = desc
    $("#"+position).append($btn)
    cnv.width = 52
    cnv.height = 52
    let ctx = cnv.getContext('2d')
    let active = false
    let hover = false
    let activating = false
    
    ctx.font = "18px serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    
    ctx.fillStyle = "white"
    ctx.strokeStyle = "black"
    ctx.lineWidth = 2
    ctx.fillRect(0,0,52,52)
    ctx.strokeRect(2,2,49,49)
    
    let src = edCTL.assets[sheet].image
    //if (sheet == "general") {
    //  src = ectl.assets.editoricons.image
    //}
    //else {
      //src = ectl.assets.appicons.image
    //}
    
    let draw = function() {
      if (activating) {
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`
      }
      else if (active && hover) {
        ctx.fillStyle = `hsl(${hue+hdev}, 100%, 50%)`
      }
      else if (active && !hover) {
        ctx.fillStyle = `hsl(${hue+hdev*2}, 100%, 50%)`
      }
      else if (!active && hover) {
        ctx.fillStyle = `hsl(${hue+hdev*3}, 100%, 50%)`
      }
      else if (!active && !hover) {
        ctx.fillStyle = "white"
      }
      ctx.fillRect(6,10,40,16)
      ctx.drawImage(src, col*48, row*22, 48, 22, 2,6,48,22)
      ctx.fillStyle = "black"
      ctx.fillText(name, 26, 34, 48)
    }
    
    let deactivate = function() {
      active = false
      draw()
    }
    
    if (init_active) {
      active = true
      deactivators[activeClass] = deactivate
    }
    draw()
    
    on($btn, "mousedown", ()=> {
      if (deactivators[activeClass]) {
        deactivators[activeClass]()
      }
      activating = true
      active = true
      deactivators[activeClass] = deactivate
      draw()
      if (typeof(value) == "function") {
        value()
      }
      else if (typeof(value) == "string") {
        // set active tool
        setTool(value)
      }
    })
    on($btn, "mouseup", ()=> {
      activating = false
      draw()
    })
    on($btn, "mouseenter", ()=> {
      hover = true
      draw()
    })
    on($btn, "mouseleave", ()=> {
      hover = false
      draw()
    })
    return $btn
  }
  let setMraypickmode = function() {
    pickmode = "mray"
  }
  let setXZpickmode = function() {
    pickmode = "xz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.UP, recentPos)
    pickplane.constant *= -1
  }
  let setXYpickmode = function() {
    pickmode = "xy"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.NORTH, recentPos)
    pickplane.constant *= -1
  }
  let setYZpickmode = function() {
    pickmode = "yz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.WEST, recentPos)
    pickplane.constant *= -1
  }
  
  addEditorBTN("MRAY", "Pick against object under mouse cursor", setMraypickmode, false, "optionButtons", "pickmode", "editoricons", 0, 0, 40, 5)
  addEditorBTN("XZ", "Pick against an XZ plane", setXZpickmode, true, "optionButtons", "pickmode", "editoricons", 0, 1, 40, 5)
  addEditorBTN("XY", "Pick against an XY plane", setXYpickmode, false, "optionButtons", "pickmode", "editoricons", 0, 2, 40, 5)
  addEditorBTN("YZ", "Pick against an YZ plane", setYZpickmode, false, "optionButtons", "pickmode", "editoricons", 0, 3, 40, 5)

  on($("#foldcommandsBTN"), "click", ()=>{ $("#commands").toggle()})
  on($("#foldtoolsBTN"), "click", ()=>{ $("#tools").toggle()})
  on($("#foldoptionsBTN"), "click", ()=>{ $("#options").toggle()})
  
  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }
  on($("#hideabout"), "click", toggleAboutBox)
  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]
  $("#controls").append(aboutBTN)
  
  let portuiBTN
  let portuiVisible = false
  let togglePortUI = function() {
    if (portuiVisible) {
      $("#port").hide()
      portuiVisible = false
    }
    else {
      $("#port").show()
      putFloatingElement($("#port")[0], portuiBTN)
      $("#exportTarget")[0].value = serialize()
      portuiVisible = true
    }
  }
  portuiBTN = $("<div>").addClass("btn_active").text("Export/Import").click(togglePortUI)[0]
  $("#controls").append(portuiBTN)
  
  on($("#foldrecentBTN"), "click", ()=>{ $("#recentColors").toggle()})
  on($("#foldpalettecfgBTN"), "click", ()=>{ $("#palettecfg").toggle()})
  on($("#foldpaletteBTN"), "click", ()=>{ $("#palleteColors").toggle()})
  
  let pixCNV = $("<canvas>")[0]
  pixCNV.width = 1
  pixCNV.height = 1
  let pixCTX = pixCNV.getContext('2d')
  
  // Convery a color string to a standardized format ...
  //  by drawing it onto a hidden canvas, then reading the resulting pixel value...
  let toRGBstring = function(col) {
    pixCTX.fillStyle = col
    pixCTX.fillRect(0,0,1,1)
    let imgd = pixCTX.getImageData(0,0,1,1)
    return `rgb(${imgd.data[0]},${imgd.data[1]},${imgd.data[2]})`
  }
  
  let activeTool
   
  //-------------------------------------------
  //  Yet another ad-hoc color picker
  //-------------------------------------------
  //  This one can be used to pick an entire pallete (multiple colors to define an object)
  //  This one offers a decent gamut, yet does not ever require more than a single click.
  //  This one provides easilly repeatable selections
  //  This one also works directly on ekvx Tools.
  //  This one is also very short and simple (under 200 lines of code)
  //  And if that's not enough, this one [arguably unnecessarilly] also allows User to configure the palette generator
  let pickColor
  let colorBTN = function(params) {
    let $elem = $('<span class="noselect">')
    let $loc = $("#" + params.loc)
    this.color = params.color
    $elem.appendTo($loc)
    
    let elem = $elem[0]
    elem.style["background-color"] = params.color
    elem.style["border-color"] = "lightgray"
    elem.style["border-style"] = "solid"
    
    on(elem, "mouseover", ()=>{
      elem.style["border-color"] = "black"
    })
    on(elem, "mouseout", ()=>{
      elem.style["border-color"] = "lightgray"
    })
    
    let resize = function(w,h) {
      if (h == undefined) {
        h = w
      }
      elem.style["min-width"] = w
      elem.style["max-width"] = w
      elem.style["min-height"] = h
      elem.style["max-height"] = h
    }
    
    let sz
    if (params.small) {
      if (params.emphasize) {
        resize(9,18)
      }
      else {
        resize(9,9)
      }
      elem.style["border-width"] = 1
      elem.style["margin"] = 0
    }
    else {
      resize(18)
      elem.style["border-width"] = 2
      elem.style["margin"] = 2
    }
    
    this.remove = function() {
      $(elem).remove()
    }
    let _color
    Object.defineProperty(this, 'color', {
      set:function(col) { 
        _color = col
        elem.style["background-color"] = col
      },
      get:function() {
        return _color
      }
    })
    this.color = params.color
    if (params.setRecent) {
      on(elem, "click", ()=>{
        if (pickColor) {
          //primaryBTN.setColor(this.color)
          pickColor(this.color)
          nextRecentColor(this.color)
          $("#colorPicker").hide()
          pickColor = undefined
        }
      })
    }
    else {
      on(elem, "click", ()=>{
        if (pickColor) {
          pickColor(this.color)
          $("#colorPicker").hide()
          pickColor = undefined
        }
      })
    }
  }
  
  let recentColorBTNS = []
  for (let i = 0; i < 21; i++) {
    let btn = new colorBTN({ loc:"recentColors", color:"white" })
    recentColorBTNS.push(btn)
  }
  
  let nextRecentColor = function(col) {
    for (let i = recentColorBTNS.length-1; i >= 1; i--) {
      let j = i - 1
      recentColorBTNS[i].color = recentColorBTNS[j].color
    }
    recentColorBTNS[0].color = col
  }
  
  let _col = new THREE.Color()
  let numHues = 18
  
  let paletteBTNS = []
  
  let loadPalette = function() {
    for (let btn of paletteBTNS) {
      btn.remove()
    }
    paletteBTNS = []
    let sats, lights, numHues
    try {
      sats = extractNums($("#satsTA")[0].value)
    }
    catch {}
    if (!sats || (sats.length == 0)) {
      sats = [1, 0.6, 0.3, 0.1]
    }
    try {
      lights = extractNums($("#lightsTA")[0].value)
    }
    catch {}
    if (!lights || (lights.length == 0)) {
      lights = [0.85, 0.7, 0.5, 0.25, 0.1]
    }
    
    //build buttons for each color, but [for sanity] do not exceed 1800 buttons generated
    let count = 0
    
    numHues = clamp(Number.parseFloat($("#numHuesTA")[0].value), 0, 360)
    for (let l = 0; l < numHues; l++) {      
      _col.setHSL(0, 0, l/(numHues-1))
      paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true, setRecent:true }))
      count++
      if (count > 1800) {
        return
      }
    }
    // Why go through the trouble of inserting a big color picker, when I can just do this?:
    for (let s of sats) {
      for (let l of lights) {
        for (let h = 0; h < numHues; h ++) {
          _col.setHSL(h/numHues, s, l)
          paletteBTNS.push(new colorBTN({ loc:"palleteColors", color:_col.getStyle(), small:true, setRecent:true, emphasize:((numHues==18) && (l==0.5)) }))
          count++
          if (count > 1800) {
            return
          }
        }
      }
    }
  }
  loadPalette()
  
  on($("#numHuesTA"), "input", loadPalette)
  on($("#satsTA"), "input", loadPalette)
  on($("#lightsTA"), "input", loadPalette)
  
  on($("#resetHSLcfgBTN"), "click", ()=>{
    $("#numHuesTA")[0].value = "18"
    $("#satsTA")[0].value = "100 60 30 10"
    $("#lightsTA")[0].value = "85 70 50 25 10"
    loadPalette()
  })
  
  
  let extractNums = function(val) {
    let parts = val.split(' ')
    let r = []
    for (let part of parts) {
      r.push(clamp(Number.parseFloat(part)/100, 0,1))
    }
    return r
  }
  
  let updateTerrainProperties = function() {
    if (activeTool) {
      if (activeTool.spec.terrain) {
        activeTool.terrainID = boxterrainDefiners[activeTool.spec.terrain.name]()
      }
    }
  }
  
  let activateCpicker = function(targetElem, cpcallback) {
    let $cpk = $("#colorPicker")
    $cpk.show()
    pickColor = cpcallback
    let cooldown = Date.now()+333
    on(document, "escape", (evt)=>{
      $cpk.hide()
      cpcallback = undefined
    })
    putFloatingElement($cpk[0], targetElem)
  }
  
  let btnfunc = function(location, btntext, func) {
    let $btn = $('<span class="btn_neutral">')
    $btn.text(btntext)
    let $loc = $("#" + location)
    on($btn, "click", func)
    $btn.appendTo($loc)
  }
  
  let patternPickerSRC = edCTL.assets.patterns.image
  let buf = $("<canvas>")[0]
  buf.width = patternPickerSRC.width
  buf.height = patternPickerSRC.height
  let bufctx = buf.getContext('2d')
  bufctx.drawImage(patternPickerSRC, 0,0)
  let ppixels = bufctx.getImageData(0,0,512,512)
  //$(buf).appendTo($("body"))
  
  let pickPattern_tileinfo
  let pickPattern_callback
  let pickPattern_color
  // [re]draw the pattern on the pattern picker canvas [using the same compositing operation as is used by the shader]
  let drawPatternPicker = function(mainColor, section) {
    if (!mainColor.isColor) {
      mainColor = new THREE.Color(mainColor)
    }
    pickPattern_color = mainColor.getStyle()
    let $cnv = $("#tpickerCNV")
    let ctx = $cnv[0].getContext('2d')
    let x1 = 0
    let x2 = 512
    let y1 = 0
    let y2 = 512
    if (section) {
      x1 = section.x1
      x2 = section.x2
      y1 = section.y1
      y2 = section.y2
    }
    
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        // extract pattern pixel, rename and convert each channel to a number in range [0:1]
        let pos = 4*(y*512+x)
        let w_main = ppixels.data[pos]/255
        let w_bg1 = ppixels.data[pos+1]/255
        let w_bg2 = ppixels.data[pos+2]/255
        
        // apply the shader compositing operation
        let r = clamp(mainColor.r*w_main + renderCTL.bg1.value.r*w_bg1 + renderCTL.bg2.value.r*w_bg2, 0, 1)*255
        let g = clamp(mainColor.g*w_main + renderCTL.bg1.value.g*w_bg1 + renderCTL.bg2.value.g*w_bg2, 0, 1)*255
        let b = clamp(mainColor.b*w_main + renderCTL.bg1.value.b*w_bg1 + renderCTL.bg2.value.b*w_bg2, 0, 1)*255
        
        //draw the pixel onto the pattern picker UI
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x+4,y+4,1,1)
        //console.log(w_main, w_bg1, w_bg2, r,g,b)
      }
    }
  }
  
  {
    let $cnv = $("#tpickerCNV")
    let $cnvo = $("#tpickerOverlayCNV")
    let ctxo = $cnvo[0].getContext('2d')
    ctxo.lineWidth=4
    on($cnv, "mousemove", (evt)=>{
      if (pickPattern_tileinfo) {
        ctxo.clearRect(0,0,520,520)
        //console.log(evt)
        let x = evt.reqtargetX-4
        let y = evt.reqtargetY-4
        let tw = 512/pickPattern_tileinfo.cols
        let th = 512/pickPattern_tileinfo.rows
        let rx = Math.floor((x/512)*pickPattern_tileinfo.cols)
        let ry = Math.floor((y/512)*pickPattern_tileinfo.rows)
        
        ctxo.setLineDash([])
        ctxo.strokeStyle = "black"
        ctxo.strokeRect(rx*tw+2, ry*th+2, tw+4, th+4)
        
        ctxo.setLineDash([8, 8])
        ctxo.strokeStyle = pickPattern_color
        ctxo.strokeRect(rx*tw+2, ry*th+2, tw+4, th+4)
      }
    })
    
    on($cnv, "click", (evt)=>{
      if (pickPattern_tileinfo && pickPattern_callback) {
        let x = evt.reqtargetX-4
        let y = evt.reqtargetY-4
        let rx = Math.floor((x/512)*pickPattern_tileinfo.cols)
        let ry = Math.floor((y/512)*pickPattern_tileinfo.rows)
        //console.log(rx, ry)
        pickPattern_tileinfo.x = rx
        pickPattern_tileinfo.y = ry
        pickPattern_callback()
      }
      $("#texturePicker").hide()
    })
  }
  
  on($("#tpRows"), "input", ()=>{
    if (pickPattern_tileinfo) {
      let rows = Number.parseInt($("#tpRows")[0].value)
      if (Number.isFinite(rows) && rows > 0) {
        pickPattern_tileinfo.rows = rows
      }
    }
  })
  on($("#tpCols"), "input", ()=>{
    if (pickPattern_tileinfo) {
      let cols = Number.parseInt($("#tpCols")[0].value)
      if (Number.isFinite(cols) && cols > 0) {
        pickPattern_tileinfo.cols = cols
      }
    }
  })
  
  let activatePatternPicker = function(targetElem, tinfo, ppcallback) {
    let $tpk = $("#texturePicker")
    $("#tpRows")[0].value = tinfo.rows
    $("#tpCols")[0].value = tinfo.cols
    $tpk.show()
    pickPattern_callback = ppcallback
    on(document, "escape", (evt)=>{
      $tpk.hide()
      pickPattern_callback = undefined
    })
    putFloatingElement($tpk[0], targetElem)
    pickPattern_tileinfo = tinfo
  }
  
  drawPatternPicker("white")
  
  
  //reset button.  At some point, the confirmation dialog should probably be removed and the deleted data instead made restoreable through an 'undo' function
  btnfunc("commands", "reset", ()=>{
    if (confirm("Editor Reset Confirmation\n* * * *\nClick 'OK' to confirm the reset and delete everything.\nClick 'Cancel' to cancel the reset.")) {
      reset()
      initialize()
   }
  })
  
  let buildComponentEditor = function(target) {
    if (!target) {
      target = activeTool.components
    }
    
    let $compelem = $("#objProperties")
    $compelem.empty()
    
    let $tbl = $(`<table>`)
    $tbl.append(`<colgroup><col style="width:5px"><col><col></colgroup>`)
    $compelem.append($tbl)
    
    
    let addRow = function(text, title, editElems) {
      if (editElems) {
        
        let $row = $("<tr>")
        $row.append(`<td>`)
        $row.append(`<td title="${title}">${text}</td>`)
        let $pedit = $(`<td>`)
        $row.append($pedit)
        $tbl.append($row)
        
        if (Array.isArray(editElems)) {
          for (let elem of editElems) {
            $pedit.append(elem)
          }
        }
        else {
          $pedit.append(editElems)
        }
      }
      else {
        $tbl.append($(`<tr><td colspan=3 style="font-size:10">${text}</td></tr>`))
      }
    }
    
    for (let [name, comp] of Object.entries(activeTool.components)) {
      let proped = name
      if (comp.proped) {
        proped = comp.proped
      }
      switch(proped) {
        // surface editor
        case "up":
        case "down":
        case "north":
        case "east":
        case "south":
        case "west":
        case "all":
        case "horiz":
        case "vert":
          addRow(name)
          //color selector
          //pattern selector
          //mergeclass textarea
          addRow("color", "Color", propEditor_color(comp, "color"))
          addRow("pattern", "Pattern", propEditor_pattern(comp, "pattern"))
          addRow("merge", "Merge Class", propEditor_textarea(comp, "mergeClass", "auto"))
          break
        case "materials":
          addRow(name)
          for (let i = 0; i < comp.length; i++) {
            if (typeof(comp[i]) == "string") {
              addRow(`m${i}-col`, `Material #${i} Main Color`, propEditor_color(comp, i))
            }
            else {
              addRow(`m${i}-col`, `Material #${i} Main Color`, propEditor_color(comp[i], "color"))
            }
          }
          break
      }
    }
  }
  
  let propEditor_color = function(obj, name) {
    let btn = $("<div>")[0]
    btn.style.width = 18
    btn.style.height = 18
    btn.style.border = "thin solid black"
    btn.style.backgroundColor = obj[name]
    on(btn, "click", ()=>{
      activateCpicker(btn, (color)=>{
        obj[name] = color
        btn.style.backgroundColor = color
        updateTerrainProperties()
      })
    })
    return btn
  }
  
  let propEditor_textarea = function(obj, name, nullVal="None", deleteIfnull=true) {
    let ta = $("<textarea>")[0]
    ta.value = obj[name]
    if (obj[name] == undefined) {
      ta.value = nullVal
    }
    ta.rows = 1
    ta.cols = 10
    ta.style.height = 16
    ta.style.resize = "none"
    on(ta, "input", ()=>{
      obj[name] = ta.value
      if (deleteIfnull && ((ta.value == nullVal) || (ta.value == "")) ) {
        delete obj[name]
      }
      updateTerrainProperties()
    })
    return ta
  }
  
  let propEditor_pattern = function(obj, k) {
    let $btn = $('<canvas width=32 height=32>')
    let cnv = $btn[0]
    let ctx = cnv.getContext('2d')
    let src = $("#tpickerCNV")[0]
    
    let ofsx = 4
    let ofsy = 4
    
    let abs_tx, abs_ty, abs_w, abs_h

    let update = function() {
      let rows = obj[k].rows
      let cols = obj[k].cols
      let x = obj[k].x
      let y = obj[k].y
      abs_w = 512/rows
      abs_h = 512/cols
      abs_tx = x*abs_w+4
      abs_ty = y*abs_h+4
      ctx.drawImage(src, abs_tx, abs_ty, abs_w, abs_h, 0, 0, 32, 32);
    }
    update()
    
    ctx.font = '12px sans-serif'
    ctx.textBaseline = "bottom"
    
    on($btn, "click", ()=>{
      activatePatternPicker($btn[0], obj[k], ()=>{
        update()
        updateTerrainProperties()
      })
    })
    
    return $btn
  }
  
  updateTerrainProperties()
  
  var amblCol = new THREE.Color("white")
  amblCol.setHSL ( 0.125, 1, 0.5 )
  var vambl = new THREE.AmbientLight(amblCol, 0.125)
  var ambl = new THREE.AmbientLight(0xffffff, 0.125)
  renderCTL.display.scene.add(ambl)
  renderCTL.display.scene.add(vambl)
  let dlight = new THREE.DirectionalLight( 0xffffff, 0.5 )
  dlight.position.set(300,1000,700)
  renderCTL.display.scene.add(dlight)
  
  var camlight = new THREE.PointLight( 0xffffff, 3.5, 16, 2 );
  camlight.position.set( 0,0,0 );
  renderCTL.display.scene.add(camlight)
  
  let bxtbldr
  
  // scene + data storage
  let vxc, UniqueObjects
  
  // 3d mouse cursor
  let cursor3d, cursorMDL
  
  // Templates are fixed lists of properties which are to be copied into the data (often this will be just be an Object type identifier).
  // Each generated object references one template
  let next_templateID = 1
  let templates = {}
  
  // All defined tools
  let tools = {}
  
  // terrain specification / utility objects
  
  //box terrain definers:
  //  These are generated functions which are used both to configure BoxTerrain and to generate a serializeable configuration for BoxTerrain.
  //  One of these is generated for each defined Terrain tool.
  //  These are called when the colors are modified through color picker UI if the ActiveTool is a terrain tool.
  //  The ActiveTool colors are passed in, the terrain for the specified colors is configured [as needed], and the corresponding terrainID is returned
  let boxterrainDefiners = {}
  
  // single surface specifications:  Each surface specifcation has these components:
  //  border:  A 256-entry texture coordinate lookup table (relative dimensions of each border tile in a texture atlas)
  //  pattern: Texture coordinates for the pattern to apply to all parts of the surface
  //  color:   An arbitrary color value to mix with the border and decal texture components
  let surfaceDefs
  let sfcIDs
  let next_sfcid
  let patternDefs
  
  // top-level terrain specification.
  // Each of these is a set of 6 surface definitions.  One for each orthogonal direction.
  //  NOTE:  terrainDefs is only a mapping of a concatenation of its surfaceDef IDs to an ID.  
  //         The complete terrain definition is stored internally by BoxTerrain and must be reconstructed whenever the data is loaded
  let terrainDefs
  let terrainIDs
  let next_terrainid
  
  // recently invalidated objects.  When erasing in mray pickmode, the most recently "erased" objects are stored here temporarilly, so that they
  // can be used to capture and nullify subsequent raycasts (instead of rapidly digging deep holes)
  let remLocs
  
  var reset = function() {
    controlActive = true
    vxc.forAll((ctn)=>{
      if (ctn.contents && ctn.contents.length > 0) {
        for (let obj of (ctn.contents)) {
          if (obj.mdl) {
            releaseAsset(edCTL.assets, obj.mdl)
          }
        }
      }
    })
    vxc.dispose()
    renderCTL.display.scene.remove(vxc.scene)
    
  }
  let initialize = function() {
    bxtbldr = new BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
    vxc = new VxScene({
      boxterrain:bxtbldr,
      chunks_per_tick:4
    })
    renderCTL.display.scene.add(vxc.scene)
    cursor3d = {
      x:0,y:0,z:0,
      up:direction.code.UP,
      forward:direction.code.NORTH,
      isEditorUI:true,
      mdl:new THREE.Object3D()
    }
    
    cursorMDL = getAsset(edCTL.assets, "CubeCursor")
    cursor3d.mdl.add(cursorMDL)
    cursor3d._mdl = cursorMDL
    put(cursor3d,0,0,0)
    
    UniqueObjects = {}
    next_terrainid = 1
    next_sfcid = 1
    terrainIDs = {}
    sfcIDs = {}
    surfaceDefs = {}
    terrainDefs = {}
    patternDefs = {}
    remLocs = []
    updateTerrainProperties()
  }
    
  let put = function(obj, x,y,z, ld=false) {
    let ctn = vxc.get(obj.x,obj.y,obj.z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    obj.x = x
    obj.y = y
    obj.z = z
    
    ctn = vxc.get(x,y,z)
    if (!ctn.contents) {
      ctn.contents = []
    }
    ctn.contents.push(obj)
    if (obj.terrainID) {
      if (ld) {
        vxc.loadTerrain(x,y,z, obj.terrainID)
      }
      else {
        vxc.setTerrain(x,y,z, obj.terrainID)
      }
      return
    }
    else if (obj.mdl) {
      if (!obj.mdl.parent) {
        vxc.scene.add(obj.mdl)
      }
      obj.mdl.position.set(x,y,z)
    }
  }
  
  let remove = function(obj, x,y,z) {
    if (obj.terrainID) {
      vxc.setTerrain(x,y,z, 0)
      //return
    }
    let ctn = vxc.get(x,y,z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    if (obj.mdl) {
      if (obj.mdl.parent) {
        obj.mdl.parent.remove(obj)
      }
      releaseAsset(edCTL.assets, obj.mdl)
    }
  }
  
  
  let draw_debugline = false
  let debug_obj
  {(async function Cursor3DControl () {
    let evtman = new NextEventManager()
    
    while (true) {
      let evt = await evtman.next(disp_elem, "mousemove", document, ".wasd arrows", edCTL.event, "refresh")
      //console.log(evt)
      let mp3d, up, forward, _
      mp3d = sviewCTL.mpos3d
      
      switch(pickmode) {
        case "xz":
          if (sviewCTL.campos.phi/Math.PI < 0.5) {
            up = direction.code.UP
          }
          else {
            up = direction.code.DOWN
          }
          ;[forward, _] = toForward(up, mp3d.x-Math.round(mp3d.x), 0, mp3d.z-Math.round(mp3d.z))
          break
        case "xy":
          if ( (sviewCTL.campos.theta/Math.PI < 0.5) || (sviewCTL.campos.theta/Math.PI > 1.5) ) {
            up = direction.code.SOUTH
          }
          else {
            up = direction.code.NORTH
          }
          ;[forward, _] = toForward(up, mp3d.x-Math.round(mp3d.x), mp3d.y-Math.floor(mp3d.y)-0.5, 0)
          break
        case "yz":
          if (sviewCTL.campos.theta > 0) {
            up = direction.code.EAST
          }
          else {
            up = direction.code.WEST
          }
          ;[forward, _] = toForward(up, 0, mp3d.y-Math.floor(mp3d.y)-0.5, mp3d.z-Math.round(mp3d.z))
          break
        case "mray": {
          let mray = sviewCTL.mray
          let origin = mray.origin.clone()
          let ray_end = mray.direction.clone()
          ray_end.multiplyScalar(PICKRAY_LENGTH)
          ray_end.add(origin)
          origin.x += 0.5
          origin.z += 0.5
          ray_end.x += 0.5
          ray_end.z += 0.5
          
          let plot = function(coord) {
            //check the spatial class of each object at each plotted position against the ActiveTool spatial-class-pick list.
            //  If a match is found, then pick either the position of the object or the immediately adjacent position [along the picked face up vector]
            //  and cancel the plotting operation.
            let ctn = vxc.get(coord.x, coord.y, coord.z)
            let spclasses = activeTool.spec.spclassPick
            if (ctn.contents) {
              let strpos = `${coord.x},${coord.y},${coord.z}`
              for (let obj of ctn.contents) {
                if (mrayDragPOSs && (mrayDragPOSs.indexOf(strpos) != -1)) {
                  continue
                }
                if ((!obj.isEditorUI) && ((spclasses == "*") || (obj.spec && (spclasses.indexOf(obj.spec.spatialClass) != -1)))) {
                  up = coord.up
                  forward = coord.forward
                  mp3d = coord
                  if (activeTool.spec.pickOut) {
                    switch(up) {
                      case direction.code.UP:
                        coord.y++
                        break
                      case direction.code.DOWN:
                        coord.y--
                        break
                      case direction.code.NORTH:
                        coord.z++
                        break
                      case direction.code.EAST:
                        coord.x--
                        break
                      case direction.code.SOUTH:
                        coord.z--
                        break
                      case direction.code.WEST:
                        coord.x++
                        break
                    }
                  }
                  // cancel the plotting operation
                  return false
                }
              }
            }
            //continue the plotting operation
            return true
          }
          
          // Plot a line from the mouse position, outward from the camera
          // (mouse position is the screen-space mouse coordinates, projected onto the camera's backplane)
          if (draw_debugline) {
            if (debug_obj) {
              vxc.scene.remove(debug_obj)
              for (let ch of debug_obj.children) {
                if (ch.isGeometry) {
                  ch.dispose()
                }
                if (ch.material) {
                  ch.material.dispose()
                }
              }
            }
            debug_obj = debugLine(origin, ray_end, plot)
            vxc.scene.add(debug_obj)
            draw_debugline = false
            controlActive = true
          }
          else {
            plotLine(origin, ray_end, plot)
            controlActive = true
          }
        } break
      }
      if ( ((up != cursor3d.up) || (forward != cursor3d.forward)) && (forward != direction.code.NODIR) && (up != undefined) && (forward != undefined) ) {
        cursor3d.up = up
        cursor3d.forward = forward
        let orientation = {}
        setOrientation(orientation, direction.invert[forward], up)
        cursor3d._mdl.position.copy(orientation.position)
        cursor3d._mdl.setRotationFromEuler(orientation.rotation)
        controlActive = true
      }
      
      if (mp3d) {
        edCTL.event.dispatchEvent( new Event("mousemove_point"))
        
        // Truncate mouse position to obtain integer coordinates
        // The origin of each unit-cube is positioned at the center of the bottom face.
        let x = Math.round(mp3d.x)
        let y = Math.floor(mp3d.y+0.001) //hack to keep XZ picking consistant - no formal means has yet been defined to fix coordinates in one dimension
        let z = Math.round(mp3d.z)       //everything else can be as jittery as it wants
        
        //cube
        if ( (x != cursor3d.x) | (y != cursor3d.y) | (z != cursor3d.z)) {
          put(cursor3d, x,y,z)
          controlActive = true
          edCTL.event.dispatchEvent(new Event("mousemove_cube"))
        }
      }
    }
  })()}
  
  // If any object(s) that conflict with the active tool are present at the cursor position, delete them
  let evict = function(up) {  
    let ctn = vxc.get(cursor3d.x, cursor3d.y, cursor3d.z)
    if (ctn.contents) {
      let coexistWith = activeTool.spec.spclassCoexist
      if (coexistWith.indexOf("*") != -1) {
        return
      }
      for (let i = ctn.contents.length-1; i >= 0; i--) {
        let obj = ctn.contents[i]
        
        if (obj.spec && obj.spec.spatialClass) {
          // If the active tool is volumetric, but the object is not, ignore it
          if (activeTool.spec.volumetric) {
            if (!obj.spec.volumetric) {
              continue
            }
          }
          // If an attachment tool, but the object is not at the expected position, ignore it
          else {
            if (up != obj.up) {
              continue
            }
          }
          
          // If the object's spatial class is not present in the coexist list, it conflicts with the tool and should be removed
          if (coexistWith.indexOf(obj.spec.spatialClass) == -1) {
            remove(obj, cursor3d.x, cursor3d.y, cursor3d.z)
          }
        }
      }
    }
  }
  let build = function() {
    let up, forward
    // if an aligned object, determine up and forward vectors
    if ((activeTool.spec.alignMode != "none") && (activeTool.spec.alignMode != undefined)) {
      switch(activeTool.spec.alignMode) {
      
        //Horizontal mode:  
        //  up vector is locked to World-UP, 
        //  If the cursor is horizontal (World-UP or World-DOWN), the cursor forward vector is retained
        //  If the cursor is vertical, the cursor's up vector is used as forward (point object away from a vertical surface behind the cursor)
        case "horiz":
        case "horizontal":
          up = direction.code.UP
          if ( (cursor3d.up == direction.code.UP) || (cursor3d.up == direction.code.DOWN) ) {
            forward = cursor3d.forward
          }
          else {
            forward = cursor3d.up
          }
          break
        case "any":
        case "*":
          up = cursor3d.up
          forward = cursor3d.forward
          break
      }
    }
    evict(up) 
    let obj = {}
    let uprop = activeTool.spec.unique
    if (uprop) {
      if (typeof(uprop) != "string") {
        uprop = "type"
      }
      let other = UniqueObjects[activeTool.spec[uprop]]
      if (other) {
        remove(other, other.x, other.y, other.z)
      }
      UniqueObjects[activeTool.spec[uprop]] = obj
    }
    controlActive = true
    obj.data = {}
    for (let k in activeTool.spec.params) {
      if (obj[k] == undefined) {
        obj[k] = activeTool.spec.params[k]
      }
    }
    obj.spec = activeTool.spec
    obj.data.$ = [activeTool.templateID, cursor3d.x, cursor3d.y, cursor3d.z]
    if (activeTool.terrainID) {
      obj.terrainID = activeTool.terrainID
      obj.data.$.push(activeTool.terrainID)
    }
    else if (activeTool.spec.model) {
      let mdl = getAsset(edCTL.assets, activeTool.spec.model)
      obj.mdl = new THREE.Object3D()
      obj.mdl.add(mdl)
      if (activeTool.components) {
        for (let compName in activeTool.components) {
          switch(compName) {
            //bypass "virtual" components (mainly these are used for terrain properties)
            case "up":
            case "down":
            case "north":
            case "east":
            case "south":
            case "west":
            case "all":
            case "horiz":
            case "vert":
              break
            case "materials":
              let mats = deepcopy(activeTool.components[compName])
              assignMaterials(mdl, mats)
              obj.data[compName] = deepcopy(activeTool.components[compName])
              break
            //every other component
            default:
              obj.data[compName] = deepcopy(activeTool.components[compName])
              break
          }
        }
      }
      
      if ((activeTool.spec.alignMode != "none") && (activeTool.spec.alignMode != undefined)) {
        obj.data.$.push(up)
        obj.data.$.push(forward)
        let orientation = {}
        setOrientation(orientation, forward, up)
        mdl.position.copy(orientation.position)
        mdl.setRotationFromEuler(orientation.rotation)
      }
    }
    if (mrayDragPOSs) {
      let strpos = `${cursor3d.x},${cursor3d.y},${cursor3d.z}`
      mrayDragPOSs.push(strpos)
      if (mrayDragPOSs.length > MrayDragLimit) {
        mrayDragPOSs.shift(1)
      }
    }
    put(obj, cursor3d.x, cursor3d.y, cursor3d.z)
  }
  
  let erase = function() {
    let ctn = vxc.get(cursor3d.x, cursor3d.y, cursor3d.z)
    if (ctn && ctn.contents) {
      remLocs.push(ctn)
      if (pickmode == "mray") {
      
        let shadeOBJ = {
          x:cursor3d.x,y:cursor3d.y,z:cursor3d.z,
          mdl:getAsset(edCTL.assets, "ShadeCube")
        }
        put(shadeOBJ,cursor3d.x, cursor3d.y, cursor3d.z)
        
        if (remLocs.length > MrayDragLimit) {
          removeObjects(1)
        }
      }
      else {
        removeObjects()
      }
    }
  }
  let finishErase = function() {
    erase()
    removeObjects()
  }
  
  let removeObjects = function(amt=99999) { 
    for (let i = 0; i < amt; i++) {
      if (remLocs.length == 0) {
        return
      }
      let ctn = remLocs.shift(1)
      for (let j = ctn.contents.length-1; j >= 0; j--) {
        let obj = ctn.contents[j]
        if (!obj.isEditorUI) {
          remove(ctn.contents[j], ctn.x, ctn.y, ctn.z)
        }
      }
    }
  }
  
  let opSpecs = {
    buildcube:{ 
      click:build, 
      drag:build,
      drag_evttype:"mousemove_cube" 
    },
    erase:{
      click:erase, 
      drag:erase,
      release:finishErase,
      drag_evttype:"mousemove_cube"
    }
  }
  
  let handleInput = async function(opspec) {
    let evtman = new NextEventManager()
    outer:
    while (true) {
      let evt = await evtman.next(disp_elem, "lmb_down", edCTL.event, "cancel")
      if (evt.vname == "cancel") {
        return
      }
      if (pickmode == "mray") {
        //draw_debugline = true
        if (!mrayDragPOSs || mrayDragPOSs.length != 0) {
          mrayDragPOSs = []
        }
      }
      else {
        recentPos.x = cursor3d.x
        recentPos.y = cursor3d.y
        recentPos.z = cursor3d.z
        mrayDragPOSs = undefined
      }
      if (opspec.click) { opspec.click() }
      if (opspec.drag_evttype) {
        inner:
        while (true) {
          evt = await evtman.next(disp_elem, "lmb_up", edCTL.event, opspec.drag_evttype, "cancel")
          switch(evt.vname) {
            case "cancel":
              if (opspec.cancel) { opspec.cancel() }
              return
            case "lmb_up":
              if (!mrayDragPOSs || mrayDragPOSs.length != 0) {
                mrayDragPOSs = []
              }
              if (opspec.release) { opspec.release() }
              edCTL.event.dispatchEvent( new Event("refresh"))
              break inner
            case opspec.drag_evttype:
              if (opspec.drag) { opspec.drag() }
              break
          }
          if (pickmode != "mray") {
            recentPos.x = cursor3d.x
            recentPos.y = cursor3d.y
            recentPos.z = cursor3d.z
          }
        }
      }
    }
  }
  
  
  //Scan an Object for "target" objects with a property named "ref" or "copy".
  //  When "ref" or "copy" is encountered, retrieve the referenced object by following names from the top-level object, then
  //  if it is a "ref" field, replace the target object with a direct reference to the resolved object
  //  if it is a "copy" field, replace the target object with a deep copy of the resolved object
  //This could be replaced with something that adds a proper referncing scheme to JSON, but if going that far, 
  //  might as well consider using a simpler markup language.
  let resolveRefs = function(obj) {
    let refs = []
    findRefs(obj, obj, refs)
    for (let ref of refs) {
      ref.obj[ref.k] = ref.val
    }
  }
  let findRefs = function(mainObj, obj, refs) {
    for (let [k,v] of Object.entries(obj)) {
      if (typeof(v) == "object") {
        if (v.copy) {
          refs.push({
            obj:obj,
            k:k,
            val:deepcopy(resolveName(mainObj, v.copy))
          })
        }
        else if (v.ref) {
          refs.push({
            obj:obj,
            k:k,
            val:resolveName(mainObj, v.ref)
          })
        }
        else {
          findRefs(mainObj, v, refs)
        }
      }
    }
  }
  // scan a [heirarchical] object for a referenced object.
  let resolveName = function(obj, ref) {
    let names = ref.split('.')
    for (let name of names) {
      obj = obj[name]
    }
    return obj
  }
  
  let defineTool = function(spec) {
    //wrap the spec
    let tool = {
      spec:spec,
      components:deepcopy(spec.components)
    }
    // If pickModes is specified as a string, expand it to an array.
    if (typeof(spec.pickModes) == "string") {
      switch(spec.pickModes) {
        case "any":
          spec.pickModes = ["xz", "xy", "yz", "pick"]
          break
        case "planar":
          spec.pickModes = ["xz", "xy", "yz"]
          break
        default:
          spec.pickModes = [spec.pickModes.split(" ")]
          break
      }
    }

    if (typeof(spec.spclassPick) == "string") {
      spec.spclassPick = spec.spclassPick.split(" ")
    }
    
    if (typeof(spec.spclassCoexist) == "string") {
      spec.spclassCoexist = spec.spclassCoexist.split(" ")
    }
        
    if (spec.terrain) {
      if (!spec.terrain.name) {
        spec.terrain.name = spec.type
      }
      defineTerrain(spec.terrain)
    }
    
    if (!anythingIN(spec.template)) {
      spec.template = {type:spec.type}
    }
    
    tool.templateID = next_templateID
    templates[next_templateID] = spec.template
    next_templateID++
    
    //store the tool
    tools[spec.name] = tool
  
    addEditorBTN(
      spec.shortname ? spec.shortname : spec.name, 
      spec.desc ? spec.desc : spec.name,
      spec.name, 
      false, 
      "tools", 
      "*", 
      spec.icon.sheet, spec.icon.row, spec.icon.col, 
      275, 5
    )
  }
  
  let setTool = function(name) {
    edCTL.event.dispatchEvent(new Event("cancel"))
    activeTool = tools[name]
    let opspec = opSpecs[activeTool.spec.routine]
    handleInput(opspec)
    
    buildComponentEditor()
    updateTerrainProperties()
    
    cursor3d.mdl.remove(cursorMDL)
    releaseAsset(edCTL.assets, cursorMDL)
    cursorMDL = getAsset(edCTL.assets, activeTool.spec.cursorModel)
    cursor3d._mdl = cursorMDL
    cursor3d.mdl.add(cursorMDL)
  }
  
  // BoxTerrain configuration section
  // Purpose of this is to expose the internal features of BoxTerrain (multiple sets of boundary graphics from a texture atlas, arbitrary patterns from a second
  // texture atlas, and unique configurations for each of the 6 directions)
  
  let toPatternParams = function(patternSpec) {
    let k = JSON.stringify(patternSpec)
    if (patternDefs[k]) {
      return patternDefs[k]
    }
    let pdef = {
      type:DECAL_UVTYPE.TILE,
      lut:{
        num_rows:patternSpec.rows,
        num_cols:patternSpec.cols,
        entry:patternSpec.cols*patternSpec.y + patternSpec.x
      }
    }
    patternDefs[k] = pdef
    return pdef
  }
  
  // attach the specified "block" bounds to a params object (parameters for gen.build_texcoordLUT)
  let apply8bitTerrspec = function(params, terrspec) {
    let left = (terrspec.block % terrspec.gridWidth) / terrspec.gridWidth
    let right = left + 1/terrspec.gridWidth
    let top = Math.floor(terrspec.block / terrspec.gridWidth) / terrspec.gridHeight
    let bottom = top + 1/terrspec.gridHeight
    params.num_rows = 16 * terrspec.gridHeight,
    params.num_cols = 16 * terrspec.gridWidth,
    params.texcoord_ul = {x:left, y:top},
    params.texcoord_br = {x:right, y:bottom}
  }
  
  let defineTerrain = function(terrspec) {
    let facedefs = [{}, {}, {}, {}, {}, {}]
    
    if (terrspec.primary.all) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.all)
      apply8bitTerrspec(facedefs[1], terrspec.primary.all)
      apply8bitTerrspec(facedefs[2], terrspec.primary.all)
      apply8bitTerrspec(facedefs[3], terrspec.primary.all)
      apply8bitTerrspec(facedefs[4], terrspec.primary.all)
      apply8bitTerrspec(facedefs[5], terrspec.primary.all)
    }
    if (terrspec.primary.v) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.v)
      apply8bitTerrspec(facedefs[1], terrspec.primary.v)
      apply8bitTerrspec(facedefs[2], terrspec.primary.v)
      apply8bitTerrspec(facedefs[3], terrspec.primary.v)
    }
    if (terrspec.primary.h) {
      apply8bitTerrspec(facedefs[4], terrspec.primary.h)
      apply8bitTerrspec(facedefs[5], terrspec.primary.h)
    }
    if (terrspec.primary.n) {
      apply8bitTerrspec(facedefs[0], terrspec.primary.n)
    }
    if (terrspec.primary.e) {
      apply8bitTerrspec(facedefs[1], terrspec.primary.e)
    }
    if (terrspec.primary.s) {
      apply8bitTerrspec(facedefs[2], terrspec.primary.s)
    }
    if (terrspec.primary.w) {
      apply8bitTerrspec(facedefs[3], terrspec.primary.w)
    }
    if (terrspec.primary.u) {
      apply8bitTerrspec(facedefs[4], terrspec.primary.u)
    }
    if (terrspec.primary.d) {
      apply8bitTerrspec(facedefs[5], terrspec.primary.d)
    }
    
    let baseK = JSON.stringify(terrspec)+"|"
    
    boxterrainDefiners[terrspec.name] = function config_bxt() {
      let k = baseK + JSON.stringify(activeTool.components)
      if (terrainIDs[k]) {
        return terrainIDs[k]
      }
      for (let k in activeTool.components) {
        activeTool.components[k].color = toRGBstring(activeTool.components[k].color)
      }
      
      let comps = []
      if (activeTool.components.all) {
        comps[0] = activeTool.components.all
        comps[1] = activeTool.components.all
        comps[2] = activeTool.components.all
        comps[3] = activeTool.components.all
        comps[4] = activeTool.components.all
        comps[5] = activeTool.components.all
      }
      if (activeTool.components.horiz) {
        comps[4] = activeTool.components.horiz
        comps[5] = activeTool.components.horiz
      }
      if (activeTool.components.vert) {
        comps[0] = activeTool.components.vert
        comps[1] = activeTool.components.vert
        comps[2] = activeTool.components.vert
        comps[3] = activeTool.components.vert
      }
      if (activeTool.components.up) {
        comps[4] = activeTool.components.up
      }
      if (activeTool.components.north) {
        comps[0] = activeTool.components.north
      }
      if (activeTool.components.east) {
        comps[1] = activeTool.components.east
      }
      if (activeTool.components.south) {
        comps[2] = activeTool.components.south
      }
      if (activeTool.components.west) {
        comps[3] = activeTool.components.west
      }
      if (activeTool.components.down) {
        comps[5] = activeTool.components.down
      }
      
      
      for (let i = 0; i < 6; i++) {
        Object.assign(facedefs[i], toPatternParams(comps[i].pattern))
        facedefs[i].mergeClass = comps[i].mergeClass
      }
    
      //Configure the box terrain for each surface [with the corresponding color & pattern parameters]
      let tid = next_terrainid
      terrainIDs[k] = tid
      let sfcdefids = [tid]
      next_terrainid++
      for (let i = 0; i < 6; i++) {
        let fdef = facedefs[i]
        let sfcparams = {
          color:comps[i].color,
          uv2info:fdef
        }
        let k = JSON.stringify(sfcparams)
        let sfcid = sfcIDs[k]
        if (sfcid) {
          sfcdefids[i+1] = sfcid
          continue
        }
        else {
          bxtbldr.defineSurface_8bit(next_sfcid, {
            color:comps[i].color,
            uv2info:fdef,
            mergeClass:comps[i].mergeClass
          })
          surfaceDefs[next_sfcid] = { color:comps[i].color, uv2info:fdef }
          sfcIDs[k] = next_sfcid
          sfcdefids[i+1] = next_sfcid
          next_sfcid++
        }
      }
      bxtbldr.defineTerrain.apply(bxtbldr, sfcdefids)
      terrainDefs[tid] = sfcdefids.slice(1)
      return tid
    }
  }
  
  initialize()
  
  edCTL.configure = (async function(cfg) {
    if (typeof(cfg) == "string") {
      cfg = JSON.parse(cfg)
    }
    let appname = cfg.AppName
    if (!appname) {
      appname = "SomeoneDidntAssignThe_AppName"
    }
    
    edCTL.AppName = appname
    edCTL.DataVersion = cfg.DataVersion
    
    let rscver = cfg.EdrscVersion|0
    let prev_ver = 0|parseInt(window.localStorage[appname+"EDVER"])
    let reloadOPT = (rscver > prev_ver) ? {cache:"reload"} : undefined
    window.localStorage[appname+"EDVER"] = rscver
    
    if (cfg.Resources) {
      try {
        let update = async function(propname, loadit) {
          let result = await loadit(reloadOPT)
          return result
        }
        
        let promises = []
        let textureRefs = []
        for (let rscname in (cfg.Resources)) {
          let data = cfg.Resources[rscname]
          if (data.type == "texture") {
            textureRefs.push({
              name:rscname,
              url:data.src,
              properties:TextureProps
            })
          }
          else if (data.type == "archive") {
            promises.push(
              update(appname, (fetchOPTS)=>{
                return loadZIP(edCTL.assets, false, data.src, reloadOPT)
              })
            )
          }
        }
        if (textureRefs.length > 0) {
          promises.push(
            update(appname, (fetchOPTS)=>{
              return loadMuch( edCTL.assets, false, reloadOPT, textureRefs )
            }),
          )
        }
        
        // Whene everything is loaded, update local storage with the versions of the cached files
        await Promise.all(promises)
        console.log("Loaded Ekvxed2 app-resources")
      }
      catch (err) {
        console.log("ERROR loading app-resources:", err)
      }
    }
    
    if (cfg.Tools) {
      for (let tooldef of cfg.Tools) {
        if (tooldef.extend) {
          tooldef = Object.assign({}, cfg.AbstractTools[tooldef.extend], tooldef)
        }
        resolveRefs(tooldef, tooldef)
        defineTool(tooldef)
        if (tooldef.default) {
          setTool(tooldef.name)
        }
      }
    }
  }).bind(this)
  
  if (document.DEFAULT_EDITOR_CFG) {
    edCTL.configure(document.DEFAULT_EDITOR_CFG)
  }
  
  defineTool({
    type:"erase",
    name:"Erase",
    pickModes:["xz", "xy", "yz", "pick"],
    alignMode:"none",
    pickIn:true,
    spclassPick:"*",
    routine:"erase",
    cursorModel:"EraseCubeCursor",
    icon:{
      sheet:"editoricons",
      row:1,
      col:1
    },
  })
  
  let serialize = function() {
    let o = {
      surfaceDefs:surfaceDefs,
      terrainDefs:terrainDefs,
      templates:templates,
      objects:[],
    }
    vxc.forAll((ctn)=>{
      if (ctn.contents && ctn.contents.length > 0) {
        for (let obj of (ctn.contents)) {
          console.log(obj)
          if (obj.data) {
        
            o.objects.push(obj.data)
          }
        }
      }
    })
    return JSON.stringify(o)
  }

  var run = function run () {
    requestAnimationFrame( run );
    edCTL.event.dispatchEvent(new Event("frame"))
    
    if (vxc) {
      controlActive |= vxc.buildChunks()
    }
    
    if (controlActive) {
      controlActive = false
      camlight.position.set(renderCTL.display.camera.position.x, renderCTL.display.camera.position.y+5, renderCTL.display.camera.position.z)
      renderCTL.display.render()
    }
  }
  run()
})





















