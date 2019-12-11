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
import { BoxTerrain } from '../libek/boxterrain.js'
import { VxScene } from '../libek/scene.js'
import { plotLine } from '../libek/plot.js'

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
  
  let docTitle = document.title

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
  
  renderCTL.border = new ManagedColor("yellow")
  renderCTL.hiliteA = new ManagedColor("orange")
  renderCTL.hiliteB = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:edCTL.assets.wall_8bit_fg,
    bkgtex:edCTL.assets.patterns,
    uv2:renderCTL.uv2,
    roughness:0.76,
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.border}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.hiliteA}*bc.g + ${renderCTL.hiliteB}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })

  let markmats = [
    {color:"green", emissive:"green", emissiveIntensity:0.667}, 
    {color:"black", transparent:true, opacity:0.6}]
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
  
  // mrayDragPositions is used by mouse-ray pickmode controller to avoid picking against objects placed during the current click & drag operation
  // The list is initalized when LMB is pressed and reset when LMB is released or if click & drag is cancelled
  //  (This makes click & drag useful for building things more interesting than a chain of blocks pointing directly at the camera)
  let mrayDragPositions
  
  //Maximum amount of objects to avoid picking against (if limit is reached, it starts removing the holdest objects in the list)
  // Limit set by default to a high level due to counterintuitiveness
  let MrayDragLimit = 9999
  
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
    if (activeTool) {
      updateCursor()
    }
  }
  let setXZpickmode = function() {
    pickmode = "xz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.UP, recentPos)
    pickplane.constant *= -1
    if (activeTool) {
      updateCursor()
    }
  }
  let setXYpickmode = function() {
    pickmode = "xy"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.NORTH, recentPos)
    pickplane.constant *= -1
    if (activeTool) {
      updateCursor()
    }
  }
  let setYZpickmode = function() {
    pickmode = "yz"
    pickplane.setFromNormalAndCoplanarPoint(direction.vector.WEST, recentPos)
    pickplane.constant *= -1
    if (activeTool) {
      updateCursor()
    }
  }
  
  let pickmodeButtons = {
    mray:addEditorBTN("MRAY", "Pick against object under mouse cursor", setMraypickmode, false, "optionButtons", "pickmode", "editoricons", 0, 0, 40, 5),
    xz:addEditorBTN("XZ", "Pick against an XZ plane", setXZpickmode, true, "optionButtons", "pickmode", "editoricons", 0, 1, 40, 5),
    xy:addEditorBTN("XY", "Pick against an XY plane", setXYpickmode, false, "optionButtons", "pickmode", "editoricons", 0, 2, 40, 5),
    yz:addEditorBTN("YZ", "Pick against an YZ plane", setYZpickmode, false, "optionButtons", "pickmode", "editoricons", 0, 3, 40, 5)
  }

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
      modalizeInputElem($("#port")[0])
      putFloatingElement($("#port")[0], portuiBTN)
      $("#exportTarget")[0].value = serialize()
      portuiVisible = true
    }
  }
  
  portuiBTN = $("<div>").addClass("btn_active").text("Export/Import").click(togglePortUI)[0]
  
  on($("#import"), "click", ()=>{
    importData($("#exportTarget")[0].value)
    $("#port").hide()
    portuiVisible = false
  })
  
  on($("#savetofile"), "click", ()=>{
    console.log("save-file")
    let durl = URL.createObjectURL(new Blob([$("#exportTarget")[0].value], {type: "application/json"}))
    let elem = $("#savetofile")[0]
    elem.href = durl
    elem.download = Settings.Name + ".ekvx2"
        
    //let durl = mainCNV.toDataURL()
    //let elem = $("#savepngBTN")[0]
    //elem.href = durl
    //elem.download = picName() + ".png"
    //importData($("#exportTarget")[0].value)
    //$("#port").hide()
    //portuiVisible = false
  })
  
  on($("#loadfromfile"), "change", ()=>{
    let inputElem = $("#loadfromfile")[0]
    if (inputElem.files.length > 0) {
      let file = inputElem.files[0]
      {(async function ldFile(){
        importData(await file.text())
      })()}
    }
    $("#port").hide()
    portuiVisible = false
  })
  
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
        [activeTool.terrain, activeTool.terrainID] = boxterrainDefiners[activeTool.spec.terrain.name]()
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
        let r = clamp(mainColor.r*w_main + renderCTL.hiliteA.value.r*w_bg1 + renderCTL.hiliteB.value.r*w_bg2, 0, 1)*255
        let g = clamp(mainColor.g*w_main + renderCTL.hiliteA.value.g*w_bg1 + renderCTL.hiliteB.value.g*w_bg2, 0, 1)*255
        let b = clamp(mainColor.b*w_main + renderCTL.hiliteA.value.b*w_bg1 + renderCTL.hiliteB.value.b*w_bg2, 0, 1)*255
        
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
   }
  })
  
  // Prepare the object selector.
  // The object selector is a drop-down menu which appears when the edit-tool selects more than one object.
  // This drop-down menu shows a listing obj valid editable objects at the selected position
  // When something is selected on that drop-down menu, the object properties editor is then re-configured to edit the corresponding object.
  // if there are only 0 or 1 editable objects, the object selector will be/remain hidden (this is expected to be the case most of the time).
  let populateObjectSelector = function(ctn, side, activeObj) {
    if (ctn.contents) {
      let count = 0
      for (let obj of ctn.contents) {
        if (!obj.isEditorUI) {
          if ((side == undefined) || (obj.side == undefined) || (obj.side == side)) {
            count++
          }
        }
      }
      if (count > 1) {
        let $objsel = $("#objSelector")
        $objsel.show()
        let objsel = $objsel[0]
        let amt = objsel.length
        for (let i = 0; i < amt; i++) {
          objsel.remove(0)
        }
        for (let obj of ctn.contents) {
          if (!obj.isEditorUI) {
            if ((side == undefined) || (obj.side == undefined) || (obj.side == side)) {
              let optelem = document.createElement("option")
              optelem.__obj = obj
              if (obj == activeObj) {
                optelem.selected = true
              }
              if (obj.side == undefined) {
                optelem.text = obj.spec.name
              }
              else {
                optelem.text = direction.name[obj.side][0] + " " + obj.spec.name
              }
              objsel.add(optelem)
            }
          }
        }
        return
      }
    }
    $("#objSelector").hide()
  }
  
  on($("#objSelector"), "input", (asdf)=>{
    let objsel = $("#objSelector")[0]
    if (objsel.selectedIndex != -1) {
      let obj = objsel.selectedOptions[0].__obj
      buildComponentEditor(obj)
    }
  })
  
  let clearComponentEditor = function() {
    $("#objProperties").empty()
    $("#objSelector").hide()
  }
  let buildComponentEditor = function(obj) {
    //for now, spec & target distinction is not significant.
    //  but when more sophistication is needed, "spec" will provide additional attributes to help govern the properties editor
    let target, spec
    if (obj) {
      if (obj.data) {
        target = obj.data
        spec = obj.spec.components
      }
      else {
        target = spec = obj
      }
    }
    else {
      spec = target = activeTool.components
      $("#objSelector").hide()
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
    
    let generalProperties = []
    for (let name in spec) {
      let def = spec[name]
      let comp = target[name]
      if (comp == undefined) {  // if the component is undefined, it is a virtual component and shoudl be ignored (object properties - mainly terrain)
        continue
      }
      let proped = name
      if (comp.type) {
        proped = comp.type
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
        case "surface":
        case "horiz":
        case "vert":
          addRow(name)
          //color selector
          //pattern selector
          //mergeclass textarea
          addRow("color", "Color", propEditor_color(obj, comp, "color"))
          addRow("pattern", "Pattern", propEditor_pattern(obj, comp, "pattern"))
          addRow("merge", "Merge Class", propEditor_textarea(obj, comp, "mergeClass", "auto"))
          break
        case "NamedColors":   //Yet Another prime target for configuration-defined properties editors.
          addRow(name)
          for (let propname in comp) {
            switch(typeof(comp[propname])) {
              case "string":
                addRow(propname, propname, propEditor_color(obj, comp, propname, propname))
                break
              case "boolean":
                addRow(propname, propname, propEditor_checkbox(obj, comp, propname))
                break
            }
          }
          break
        case "materials":
          addRow(name)
          for (let i = 0; i < comp.length; i++) {
            if (typeof(comp[i]) == "string") {
              addRow(`m${i}-col`, `Material #${i} Main Color`, propEditor_color(obj, comp, i))
            }
            else {
              addRow(`m${i}-col`, `Material #${i} Main Color`, propEditor_color(obj, comp[i], "color"))
            }
          }
          break
        case "$":
          break
        default:
          generalProperties.push(name)
          break
      }
    }
    if (generalProperties.length > 0) {
      addRow("General Properties")
      for (let name of generalProperties) {
        switch(typeof(spec[name])) {
          case "string":
            addRow(name, name, propEditor_textarea(obj, target, name))
            break
          case "boolean":
            addRow(name, name, propEditor_checkbox(obj, target, name))
            break
        }
      }
    }
  }
  let propEditor_checkbox = function(obj, component, name) {
    let chkb = $('<input type="checkbox">')[0]
    chkb.value = Boolean(component[name])
    on(chkb, "input", ()=>{
      console.log("chkb-changed?")
      component[name] = chkb.checked
    })
    return chkb
  }
  
  let propEditor_color = function(obj, component, name, rctlpropname) {
    let btn = $("<div>")[0]
    btn.style.width = 18
    btn.style.height = 18
    btn.style.border = "thin solid black"
    btn.style.backgroundColor = component[name]
    on(btn, "click", ()=>{
      activateCpicker(btn, (color)=>{
        component[name] = color
        btn.style.backgroundColor = color
        if (obj) {
          updateObject(obj)
        }
        else {
          updateTerrainProperties()
        }
        if (rctlpropname) {
          let rprop = renderCTL[rctlpropname]
          if (rprop && (typeof(rprop) == "object") && rprop.isManagedParam) {
            rprop.color = color
          }
          controlActive = true
        }
      })
    })
    return btn
  }
  
  
  let modalizeInputElem = function(input_elem) {
    on(input_elem, "focusin", ()=>{
      sviewCTL.readKeyboard = false
    })
    on(input_elem, "focusout", ()=>{
      sviewCTL.readKeyboard = true
    })
  }
  
  let propEditor_textarea = function(obj, component, name, nullVal="None", deleteIfnull=true) {
    let ta = $("<textarea>")[0]
    modalizeInputElem(ta)
    ta.value = component[name]
    if (component[name] == undefined) {
      ta.value = nullVal
    }
    ta.rows = 1
    ta.cols = 10
    ta.style.height = 16
    ta.style.resize = "none"
    on(ta, "input", ()=>{
      component[name] = ta.value
      if (deleteIfnull && ((ta.value == nullVal) || (ta.value == "")) ) {
        delete component[name]
      }
      if (obj) {
        updateObject(obj)
      }
      else {
        updateTerrainProperties()
      }
    })
    return ta
  }
  
  let propEditor_pattern = function(obj, component, k) {
    let $btn = $('<canvas width=32 height=32>')
    let cnv = $btn[0]
    let ctx = cnv.getContext('2d')
    let src = $("#tpickerCNV")[0]
    
    let ofsx = 4
    let ofsy = 4
    
    let abs_tx, abs_ty, abs_w, abs_h

    let update = function() {
      let rows = component[k].rows
      let cols = component[k].cols
      let x = component[k].x
      let y = component[k].y
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
      activatePatternPicker($btn[0], component[k], ()=>{
        update()
        if (obj) {
          updateObject(obj)
        }
        else {
          updateTerrainProperties()
        }
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
  
  // 3d position indicators
  let cursor3d, cursorMDL, mark, markMDL
 
  //Miscellaneous properties 
  let Settings, DefaultSettings
  
  // Templates are fixed lists of properties which are to be copied into the data (often this will be just be an Object type identifier).
  // Each generated object references one template
  let next_templateID = 1
  let templates = {}
  
  // "memos" common objects which are referenced by ID in serialized data.  These are used to compact some of the more "verbose" aspects of ekvx2.
  let next_memoID = 1
  let memos = {}
  let memoIDs = {}
  
  // All defined tools
  let tools = {}
  
  // terrain specification / utility objects
  
  //box terrain definers:
  //  These are generated functions which are used both to configure BoxTerrain and to generate a serializeable configuration for BoxTerrain.
  //  One of these is generated for each defined Terrain tool.
  //  These are called when the colors are modified through color picker UI if the ActiveTool is a terrain tool.
  //  The ActiveTool colors are passed in, the terrain for the specified colors is configured [as needed], and the corresponding terrainID is returned
  let boxterrainDefiners = {}
  let surfaceDefs_bterr = {}
  
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
  let terrains
  let next_terrainid
  
  // recently invalidated objects.  When erasing in mray pickmode, the most recently "erased" objects are stored here temporarilly, so that they
  // can be used to capture and nullify subsequent raycasts (instead of rapidly digging deep holes)
  let remLocs
  
  var reset = function() {
    controlActive = true
    vxc.forAll((ctn)=>{
      if (ctn.contents && ctn.contents.length > 0) {
        for (let obj of (ctn.contents)) {
          if (obj.gx) {
            releaseAsset(edCTL.assets, obj.gx)
          }
        }
      }
    })
    vxc.dispose()
    renderCTL.display.scene.remove(vxc.scene)
    initialize()
  }
  let initialize = function() {
    bxtbldr = new BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
    vxc = new VxScene({
      boxterrain:bxtbldr,
      chunks_per_tick:4
    })
    edCTL.vxc = vxc
    surfaceDefs_bterr = {}
    renderCTL.display.scene.add(vxc.scene)
    cursor3d = {
      x:0,y:0,z:0,
      up:direction.code.UP,
      forward:direction.code.NORTH,
      isEditorUI:true,
      gx:new THREE.Object3D()
    }
    mark = {
      x:0,y:0,z:0,
      up:direction.code.UP,
      forward:direction.code.NORTH,
      isEditorUI:true,
      gx:new THREE.Object3D()
    }
    
    cursorMDL = getAsset(edCTL.assets, "CubeCursor")
    cursor3d.gx.add(cursorMDL)
    cursor3d.mdl = cursorMDL
    put(cursor3d,0,0,0)
    
    markMDL = getAsset(edCTL.assets, "CubeMark")
    mark.gx.add(markMDL)
    mark.mdl = markMDL
    //put(mark,0,0,0)
    
    Settings = deepcopy(DefaultSettings)
    
    if (Settings && Settings.NamedColors) {
      for (let cname in Settings.NamedColors) {
        if (cname) {
          let rprop = renderCTL[cname]
          if (rprop && (typeof(rprop) == "object") && rprop.isManagedParam) {
            rprop.color = Settings.NamedColors[cname]
          }
        }
      }
    }
    
    UniqueObjects = {}
    next_terrainid = 1
    next_sfcid = 1
    next_memoID = 1
    terrainIDs = {}
    terrains = {}
    sfcIDs = {}
    memos = {}
    memoIDs = {}
    surfaceDefs = {}
    terrainDefs = {}
    patternDefs = {}
    remLocs = []
    updateTerrainProperties()
    if (activeTool) {
      setTool(activeTool.spec.name)
    }
  }
    
  let put = function(obj, x,y,z, ld=false, ofsX=0, ofsY=0, ofsZ=0) {
    let ctn = obj.ctn
    if (ctn && ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    obj.x = x
    obj.y = y
    obj.z = z
    
    ctn = vxc.get(x, y, z)
    obj.ctn = ctn
    if (!ctn.contents) {
      ctn.contents = []
    }
    ctn.contents.push(obj)
    if (obj.terrain) {
      if (ld) {
        vxc.loadTerrain(x,y,z, obj.terrain)
      }
      else {
        vxc.setTerrain(x,y,z, obj.terrain)
      }
      return
    }
    else if (obj.gx) {
      if (!obj.gx.parent) {
        vxc.scene.add(obj.gx)
      }
      obj.gx.position.set(x+ofsX, y+ofsY, z+ofsZ)
    }
    
    if (obj.spec && obj.spec.knockout) {
      switch(obj.side) {
        case direction.code.UP:
          ctn.terr_koU = true
          break
        case direction.code.DOWN:
          ctn.terr_koD = true
          break
        case direction.code.NORTH:
          ctn.terr_koN = true
          break
        case direction.code.EAST:
          ctn.terr_koE = true
          break
        case direction.code.SOUTH:
          ctn.terr_koS = true
          break
        case direction.code.WEST:
          ctn.terr_koW = true
          break
      }
      for (let other of ctn.contents) {
        if (other.terrain) {
          vxc.setTerrain(x,y,z, other.terrain)
        }
      }
    }
  }
  
  let remove = function(obj, release=true) {
    let ctn = obj.ctn
    if (!ctn) {
      return
    }
    let x = ctn.x
    let y = ctn.y
    let z = ctn.z
    if (obj.terrain) {
      vxc.setTerrain(x,y,z)
      //return
    }
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    if (obj.gx) {
      if (obj.gx.parent) {
        obj.gx.parent.remove(obj.gx)
      }
      if (release) {
        releaseAsset(edCTL.assets, obj.gx)
      }
    }
    if (obj.spec && obj.spec.knockout) {
      switch(obj.side) {
        case direction.code.UP:
          ctn.terr_koU = false
          break
        case direction.code.DOWN:
          ctn.terr_koD = false
          break
        case direction.code.NORTH:
          ctn.terr_koN = false
          break
        case direction.code.EAST:
          ctn.terr_koE = false
          break
        case direction.code.SOUTH:
          ctn.terr_koS = false
          break
        case direction.code.WEST:
          ctn.terr_koW = false
          break
      }
      for (let other of ctn.contents) {
        if (other.terrain) {
          vxc.setTerrain(x,y,z, other.terrain)
        }
      }
    }
    obj.ctn = undefined
  }
  
  let positionKey = function(coord, isSide) {
    return isSide ? `${coord.x},${coord.y},${coord.z},${coord.up}` : `${coord.x},${coord.y},${coord.z},` 
  }
  
  {(async function Cursor3DControl () {
    let evtman = new NextEventManager()
    
    while (true) {
      let evt = await evtman.next(disp_elem, "mousemove", document, ".wasd arrows", edCTL.event, "refresh")
      //console.log(evt)
      let mp3d, up, forward, _
      mp3d = sviewCTL.mpos3d
      
      cursor3d.raycastHit = false
      
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
              let posk = positionKey(coord, isSideCursor)
              for (let obj of ctn.contents) {
                if (mrayDragPositions && (mrayDragPositions.indexOf(posk) != -1)) {
                  return !isSideCursor
                }
                if ((!obj.isEditorUI) && ((spclasses == "*") || (obj.spec && (spclasses.indexOf(obj.spec.spatialClass) != -1)))) {
                  cursor3d.raycastHit = true
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
          plotLine(origin, ray_end, plot)
          controlActive = true
        } break
      }
      if ( ((up != cursor3d.up) || (forward != cursor3d.forward)) && (forward != direction.code.NODIR) && (up != undefined) && (forward != undefined) ) {
        let orientation = {}
        setOrientation(orientation, direction.invert[forward], up)
        cursor3d.mdl.position.copy(orientation.position)
        cursor3d.mdl.setRotationFromEuler(orientation.rotation)
        controlActive = true
      }
      
      if (mp3d) {
        edCTL.event.dispatchEvent( new Event("mousemove_point"))
        
        // Truncate mouse position to obtain integer coordinates
        // The origin of each unit-cube is positioned at the center of the bottom face.
        let x = Math.round(mp3d.x)
        let y = Math.floor(mp3d.y+0.001) //hack to keep XZ picking consistant - no formal means has yet been defined to fix coordinates in one dimension
        let z = Math.round(mp3d.z)       //everything else can be as jittery as it wants
        
        //if the position changes, reposition the cursor
        if ( (x != cursor3d.x) || (y != cursor3d.y) || (z != cursor3d.z) || (((pickmode == "mray") && (up != cursor3d.up) && (forward != cursor3d.forward))) ) {
          if ( (up != undefined) && (forward != undefined)) {
            cursor3d.up = up
            cursor3d.forward = forward
            positionObject(cursor3d, x,y,z)
            controlActive = true
            edCTL.event.dispatchEvent(new Event("mousemove_cube"))
          }
        }
      }
      if (activeTool && (pickmode == "mray") && activeTool.spec.requireRaycastHit) {
        if (!cursor3d.raycastHit) {
          remove(cursor3d, false)
        }
      }
    }
  })()}
  
  let positionObject = function(indicator, x,y,z, side) {
    if (isSideCursor || (side != undefined)) {
      if (side == undefined) {
        side = indicator.up
      }
      switch(side) {
        case direction.code.UP:
          put(indicator, x,y,z, false, 0,1,0)
          break
        case direction.code.DOWN:
          put(indicator, x,y,z, false, 0,-1,0)
          break
        case direction.code.NORTH:
          put(indicator, x,y,z, false, 0,0,1)
          break
        case direction.code.EAST:
          put(indicator, x,y,z, false, -1,0,0)
          break
        case direction.code.SOUTH:
          put(indicator, x,y,z, false, 0,0,-1)
          break
        case direction.code.WEST:
          put(indicator, x,y,z, false, 1,0,0)
          break
      }
    }
    else {
      put(indicator, x,y,z)
      
      // If the [selection] mark indicator and cursor are positioned on top of each other, hide the cursor
      if (mark.ctn == cursor3d.ctn) {
        remove(cursor3d, false)
      }
    }
  }
  
  // If any object(s) that conflict with the active tool are present at the cursor position, delete them
  let evict = function(side) {  
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
            if (side != obj.side) {
              continue
            }
          }
          
          // If the object's spatial class is not present in the coexist list, it conflicts with the tool and should be removed
          if (coexistWith.indexOf(obj.spec.spatialClass) == -1) {
            remove(obj)
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
        case "vert":
        case "vertical":
          if ( (cursor3d.up == direction.code.UP) || (cursor3d.up == direction.code.DOWN) ) {
            return
          }
          else {
            up = cursor3d.up
            forward = direction.code.UP
          }
          break
        case "any":
        case "*":
          up = cursor3d.up
          forward = cursor3d.forward
          break
      }
    }
    if (!activeTool.spec.requireRaycastHit || (pickmode != "mray") || cursor3d.raycastHit) {
      if (mrayDragPositions) {
        cursor3d.up = up
        mrayDragPositions.push(positionKey(cursor3d, isSideCursor))
        if (mrayDragPositions.length >= MrayDragLimit) {
          mrayDragPositions.shift(1)
        }
      }
      evict(up)
      _build(activeTool, cursor3d.x, cursor3d.y, cursor3d.z, up, forward, activeTool.components, activeTool.terrain, activeTool.terrainID)
    }
  }
  
  let _build = function(tool, x,y,z, up, forward, components, terrain, terrainID) {
    let mdl
    let obj = {}
    let uprop = tool.spec.unique
    if (uprop) {
      if (typeof(uprop) != "string") {
        uprop = "type"
      }
      let other = UniqueObjects[tool.spec[uprop]]
      if (other) {
        remove(other)
      }
      UniqueObjects[tool.spec[uprop]] = obj
    }
    controlActive = true
    obj.data = {}
    
    obj.spec = tool.spec
    obj.data.$ = [tool.templateID, x, y, z]
    if (terrain) {
      obj.terrain = terrain
      obj.data.$.push(terrainID)
    }
    else if (tool.spec.model) {
      mdl = getAsset(edCTL.assets, tool.spec.model)
      obj.mdl = mdl
      obj.gx = new THREE.Object3D()
      obj.gx.add(mdl)
      
      if ((tool.spec.alignMode != "none") && (activeTool.spec.alignMode != undefined)) {
        if (tool.spec.attachment) {
          obj.side = up
        }
        obj.data.$.push(up)
        obj.data.$.push(forward)
        let orientation = {}
        setOrientation(orientation, forward, up)
        mdl.position.copy(orientation.position)
        mdl.setRotationFromEuler(orientation.rotation)
      }
    }
    if (components) {
      for (let compName in components) {
        switch(compName) {
          //bypass "virtual" components (mainly these are used for terrain properties)
          case "up":
          case "down":
          case "north":
          case "east":
          case "south":
          case "west":
          case "all":
          case "surface":
          case "horiz":
          case "vert":
            break
          case "materials":
            let mats = deepcopy(components[compName])
            assignMaterials(mdl, mats)
            obj.data[compName] = deepcopy(components[compName])
            break
          //every other component
          default:
            obj.data[compName] = deepcopy(components[compName])
            break
        }
      }
    }
    if ((!components || !components.materials) && tool.spec.editorMaterials) {
      assignMaterials(mdl, tool.spec.editorMaterials)
    }
    
    if (tool.spec.attachment) {
      obj.side = up
      positionObject(obj, x,y,z, up)
    }
    else {
      put(obj, x, y, z)
    }
  }
  
  let updateObject = function(obj) {
    if (obj.terrain) {
      
    }
    if (obj.data) {
      for (let compName in obj.data) {
        switch(compName) {
          case "materials":
            assignMaterials(obj.mdl, obj.data.materials)
            controlActive = true
            break
        }
      }
    }
  }
  
  let editTerrain = function() {
    if (cursor3d.raycastHit) {
      let ctn = vxc.get(cursor3d.x, cursor3d.y, cursor3d.z)
      if (ctn && ctn.contents) {
        for (let obj of ctn.contents) {
          if (obj.terrain) {
            let sfcIDX
            switch(cursor3d.up) {
              case direction.code.NORTH:
                sfcIDX = 2
                break
              case direction.code.EAST:
                sfcIDX = 3
                break
              case direction.code.SOUTH:
                sfcIDX = 0
                break
              case direction.code.WEST:
                sfcIDX = 1
                break
              case direction.code.UP:
                sfcIDX = 4
                break
              case direction.code.DOWN:
                sfcIDX = 5
                break
            }
            let sfcdefs = Array.from(obj.terrain.sfcdefs)
            let sfcdefids = Array.from(obj.terrain.sfcdefids)
            
            activeTool.components.surface.color = toRGBstring(activeTool.components.surface.color)
            let fdef = {
              area8b:activeTool.spec.area8b,
              tile:activeTool.components.surface.pattern,
              mergeClass:activeTool.components.surface.mergeClass,
              color:activeTool.components.surface.color,
            }
            let sk = JSON.stringify(fdef)
            let sfcid = sfcIDs[sk]
            if (sfcid) {
              sfcdefs[sfcIDX] = surfaceDefs_bterr[sfcid]
              sfcdefids[sfcIDX] = sfcid
            }
            else {
              let tfdef = Object.assign({}, fdef)
              tfdef.area8b = memoize(tfdef.area8b)
              tfdef.tile = memoize(tfdef.tile)
              surfaceDefs[next_sfcid] = tfdef
              let sfc = bxtbldr.build_Sfcdef(fdef)
              surfaceDefs_bterr[next_sfcid] = sfc
              sfcdefids[sfcIDX] = next_sfcid
              sfcIDs[sk] = next_sfcid
              sfcdefs[sfcIDX] = sfc
              next_sfcid++
            }
            let tk = JSON.stringify(sfcdefs)
            let terrain = terrains[tk]
            let tid = terrainIDs[tk]
            
            if (!terrain) {
              tid = next_terrainid
              terrainIDs[tk] = tid
              next_terrainid++
              terrain = terrains[tk] = bxtbldr.build_Terraindef.apply(bxtbldr, sfcdefs)
              terrain.sfcdefs = sfcdefs
              terrain.sfcdefids = sfcdefids
              terrainDefs[tid] = sfcdefids
            }
            if (terrain != obj.terrain) {
              obj.terrain = terrain
              obj.data.$[4] = tid
              put(obj, cursor3d.x, cursor3d.y, cursor3d.z)
            }
            return
          }
        }
      }
    }
  }
  
  let detach = function() {
    if (cursor3d.raycastHit) {
      let ctn = vxc.get(cursor3d.x, cursor3d.y, cursor3d.z)
      if (ctn && ctn.contents) {
        for (let i = ctn.contents.length-1; i >= 0; i--) {
          let obj = ctn.contents[i]
          if (!obj.isEditorUI && (obj.side == cursor3d.up)) {
            remove(ctn.contents[i])
          }
        }
      }
    }
  }
  
  let erase = function() {
    if (!activeTool.spec.requireRaycastHit || (pickmode != "mray") || cursor3d.raycastHit) {
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
  }
  
  let edit = function() {
    if (!activeTool.spec.requireRaycastHit || (pickmode != "mray") || cursor3d.raycastHit) {
      let ctn = vxc.get( cursor3d.x, cursor3d.y, cursor3d.z)
      if (ctn.contents) {
        for (let obj of ctn.contents) {
          if (!obj.isEditorUI && obj.data) {
            mark.up = cursor3d.up
            mark.forward = cursor3d.forward
            mark.mdl.position.copy(cursor3d.mdl.position)
            mark.mdl.rotation.copy(cursor3d.mdl.rotation)
            positionObject(mark, cursor3d.x, cursor3d.y, cursor3d.z)
            buildComponentEditor(obj)
            populateObjectSelector(ctn, (pickmode == "mray" ? cursor3d.up : undefined), obj)
            return
          }
        }
      }
      clearComponentEditor()
      remove(mark, false)
      positionObject(cursor3d, cursor3d.x, cursor3d.y, cursor3d.z)
      controlActive = true
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
          remove(ctn.contents[j])
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
    buildcube_clickonly:{ 
      click:build
    },
    erase:{
      click:erase, 
      drag:erase,
      release:finishErase,
      drag_evttype:"mousemove_cube"
    },
    detach:{
      click:detach, 
      drag:detach,
      drag_evttype:"mousemove_cube"
    },
    edit:{
      click:edit
    },
    attach:{
      click:build,
      drag:build,
      drag_evttype:"mousemove_cube"
    },
    editterrain:{
      click:editTerrain,
      drag:editTerrain,
      drag_evttype:"mousemove_cube"
    },
    settings:{ }
  }
  
  let handleInput = async function(opspec) {
    let evtman = new NextEventManager()
    outer:
    while (true) {
      let evt = await evtman.next(disp_elem, "lmb_down", edCTL.event, "cancel")
      document.activeElement.blur()
      sviewCTL.readKeyboard = true
      if (evt.vname == "cancel") {
        return
      }
      if (pickmode == "mray") {
        if (!mrayDragPositions || mrayDragPositions.length != 0) {
          mrayDragPositions = []
        }
      }
      else {
        recentPos.x = cursor3d.x
        recentPos.y = cursor3d.y
        recentPos.z = cursor3d.z
        mrayDragPositions = undefined
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
              if (!mrayDragPositions || mrayDragPositions.length != 0) {
                mrayDragPositions = []
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
  
  // Store an arbitrary object in the memos table [if not already present] and return a memo ID.  
  let memoize = function(obj) {
    let key = JSON.stringify(obj)
    let id = memoIDs[key]
    if (id == undefined) {
      id = next_memoID
      memoIDs[key] = id
      next_memoID++
      memos[id] = obj
    }
    return id
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
    if (!tool.components) {
      tool.components = {}
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
    
    if (!spec.editorOnly) {
      spec.template.toolname = spec.name
      tool.templateID = next_templateID
      templates[next_templateID] = spec.template
      next_templateID++
    }
      
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
    if (activeTool.spec.pickModes.indexOf(pickmode) == -1) {
      pickmodeButtons[activeTool.spec.pickModes[0]][0].dispatchEvent( new Event("mousedown"))
      pickmodeButtons[activeTool.spec.pickModes[0]][0].dispatchEvent( new Event("mouseup"))
    }
    for (let name in pickmodeButtons) {    
      let $btn = pickmodeButtons[name]
      if (activeTool.spec.pickModes.indexOf(name) == -1) {
        $btn.hide()
      } 
      else {
        $btn.show()
      }
    }
    
    if (activeTool) {
      let opspec = opSpecs[activeTool.spec.routine]
      handleInput(opspec)
      
      buildComponentEditor()
      updateTerrainProperties()
      
      updateCursor()
      if (activeTool.spec.type == "settings") {
        clearComponentEditor()
        buildComponentEditor(Settings)
      }
    }
    remove(mark, false)
    positionObject(cursor3d, cursor3d.x, cursor3d.y, cursor3d.z)
    controlActive = true
    
  }
  
  // Special flag to offset the cursor 1 unit along its normal vector, so that it is drawn "above" the selected position
  //  (this is used for side-attached objects and the edit tool)
  let isSideCursor = false
  
  let updateCursor = function() {
    let mdlname = activeTool.spec.cursorModel
    if (pickmode == "mray") {
      if (activeTool.spec.cursorModel_mray) {
        mdlname = activeTool.spec.cursorModel_mray
      }
      isSideCursor = activeTool.spec.sideCursor_mray
    }
    else {
      isSideCursor = activeTool.spec.sideCursor
    }
    if (activeTool.spec.attachment) {
      isSideCursor = true
    }
    cursor3d.gx.remove(cursorMDL)
    releaseAsset(edCTL.assets, cursorMDL)
    
    if (mdlname) {
      cursorMDL = getAsset(edCTL.assets, mdlname)
      cursor3d.mdl = cursorMDL
      cursor3d.gx.add(cursorMDL)
    }
    
    mdlname = activeTool.spec.markModel
    if (mdlname) {
      if (isSideCursor && activeTool.spec.markModel_mray) {
        mdlname = activeTool.spec.markModel_mray
      }
      mark.gx.remove(markMDL)
      releaseAsset(edCTL.assets, markMDL)
      
      markMDL = getAsset(edCTL.assets, mdlname)
      mark.mdl = markMDL
      mark.gx.add(markMDL)
    }
    
    positionObject(cursor3d, cursor3d.x, cursor3d.y, cursor3d.z)
    controlActive = true
  }
  
  // BoxTerrain configuration section
  // Purpose of this is to expose the internal features of BoxTerrain (multiple sets of boundary graphics from a texture atlas, arbitrary patterns from a second
  // texture atlas, and unique configurations for each of the 6 directions)
  let defineTerrain = function(terrspec) {
    let facedefs = [{}, {}, {}, {}, {}, {}]
    
    if (terrspec.primary.all) {
      facedefs[0].area8b = terrspec.primary.all
      facedefs[1].area8b = terrspec.primary.all
      facedefs[2].area8b = terrspec.primary.all
      facedefs[3].area8b = terrspec.primary.all
      facedefs[4].area8b = terrspec.primary.all
      facedefs[5].area8b = terrspec.primary.all
    }
    if (terrspec.primary.v) {
      facedefs[0].area8b = terrspec.primary.v
      facedefs[1].area8b = terrspec.primary.v
      facedefs[2].area8b = terrspec.primary.v
      facedefs[3].area8b = terrspec.primary.v
    }
    if (terrspec.primary.h) {
      facedefs[4].area8b = terrspec.primary.h
      facedefs[5].area8b = terrspec.primary.h
    }
    if (terrspec.primary.n) {
      facedefs[0].area8b = terrspec.primary.n
    }
    if (terrspec.primary.e) {
      facedefs[1].area8b = terrspec.primary.e
    }
    if (terrspec.primary.s) {
      facedefs[2].area8b = terrspec.primary.s
    }
    if (terrspec.primary.w) {
      facedefs[3].area8b = terrspec.primary.w
    }
    if (terrspec.primary.u) {
      facedefs[4].area8b = terrspec.primary.u
    }
    if (terrspec.primary.d) {
      facedefs[5].area8b = terrspec.primary.d
    }
    
    let baseK = JSON.stringify(terrspec)+"|"
    
    boxterrainDefiners[terrspec.name] = function config_bxt() {
      let tk = baseK + JSON.stringify(activeTool.components)
      if (terrains[tk]) {
        return [terrains[tk], terrainIDs[tk]]
      }
      for (let ck in activeTool.components) {
        activeTool.components[ck].color = toRGBstring(activeTool.components[ck].color)
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
      
      
      //for (let i = 0; i < 6; i++) {
        //Object.assign(facedefs[i], toPatternParams(comps[i].pattern))
        //facedefs[i].tile = comps[i].pattern
        //facedefs[i].mergeClass = comps[i].mergeClass
      //}
    
      //Configure the box terrain for each surface [with the corresponding color & pattern parameters]
      let tid = next_terrainid
      terrainIDs[tk] = tid
      let sfcdefs = []
      let sfcdefids = []
      next_terrainid++
      for (let i = 0; i < 6; i++) {
        let fdef = facedefs[i]
        fdef.tile = comps[i].pattern
        fdef.mergeClass = comps[i].mergeClass
        fdef.color = comps[i].color
        let sk = JSON.stringify(fdef)
        let sfcid = sfcIDs[sk]
        if (sfcid) {
          sfcdefs[i] = surfaceDefs_bterr[sfcid]
          sfcdefids[i] = sfcid
          continue
        }
        else {
          let tfdef = Object.assign({}, fdef)
          tfdef.area8b = memoize(tfdef.area8b)
          tfdef.tile = memoize(tfdef.tile)
          surfaceDefs[next_sfcid] = tfdef
          let sfc = bxtbldr.build_Sfcdef(fdef)
          surfaceDefs_bterr[next_sfcid] = sfc
          sfcdefids[i] = next_sfcid
          sfcIDs[sk] = next_sfcid
          sfcdefs[i] = sfc
          next_sfcid++
        }
      }
      let terrain = terrains[tk] = bxtbldr.build_Terraindef.apply(bxtbldr, sfcdefs)
      terrain.sfcdefs = sfcdefs
      terrain.sfcdefids = sfcdefids
      terrainDefs[tid] = sfcdefids
      return [terrain, tid]
    }
  }
  
  initialize()
  
  edCTL.configure = (async function(cfg) {
    if (typeof(cfg) == "string") {
      cfg = JSON.parse(cfg)
    }
    let dtype = cfg.DataType
    if (!dtype) {
      dtype = "Unspecified-data-type"
    }
    
    edCTL.DataType = dtype
    edCTL.DataVersion = cfg.DataVersion
    edCTL.AppLink = cfg.AppLink
    
    DefaultSettings = cfg.Settings
    if (!DefaultSettings) {
      DefaultSettings = {}
    }
    DefaultSettings.Name = "untitled"
    Settings = deepcopy(DefaultSettings)
    
    document.title = `${docTitle} | "${edCTL.DataType}"`
    $("#NameDisp").text(document.title)
    
    if (edCTL.AppLink) {
      let testBTN = $("<div>").addClass("btn_active").text("Test").click(()=>{
        if (edCTL.AppWindow && !edCTL.AppWindow.closed) {
          edCTL.AppWindow.focus()
        }
        else {
          edCTL.AppWindow = window.open(edCTL.AppLink)
        }
        
        if (edCTL.AppWindow) {
          let data = serialize()
          if (edCTL.AppWindow.appCTL) {
            edCTL.AppWindow.appCTL.runTest(data)
          }
          else {
            edCTL.AppWindow.StagedTestData = data
          }
        }
      })[0]
      $("#controls").append(testBTN)
    }
    
    let rscver = cfg.EdrscVersion|0
    let prev_ver = 0|parseInt(window.localStorage[dtype+"EDVER"])
    let reloadOPT = (rscver > prev_ver) ? {cache:"reload"} : undefined
    window.localStorage[dtype+"EDVER"] = rscver
    
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
              update(dtype, (fetchOPTS)=>{
                return loadZIP(edCTL.assets, false, data.src, reloadOPT)
              })
            )
          }
        }
        if (textureRefs.length > 0) {
          promises.push(
            update(dtype, (fetchOPTS)=>{
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
    reset()
  }).bind(this)
  
  if (document.DEFAULT_EDITOR_CFG) {
    edCTL.configure(document.DEFAULT_EDITOR_CFG)
  }
  
  defineTool({
    type:"erase",
    name:"Erase",
    editorOnly:true,
    pickModes:["xz", "xy", "yz", "mray"],
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
  defineTool({
    type:"detach",
    name:"Detach",
    editorOnly:true,
    pickModes:["mray"],
    alignMode:"none",
    pickIn:true,
    spclassPick:"*",
    routine:"detach",
    cursorModel:"EraseFaceCursor",
    sideCursor_mray:true,
    requireRaycastHit:true,
    icon:{
      sheet:"editoricons",
      row:1,
      col:0
    },
  })
  
  defineTool({
    type:"edit",
    name:"Edit",
    editorOnly:true,
    pickModes:["xz", "xy", "yz", "mray"],
    alignMode:"none",
    pickIn:true,
    spclassPick:"*",
    routine:"edit",
    cursorModel:"CubeCursor",
    cursorModel_mray:"FaceCursor",
    markModel:"CubeMark",
    markModel_mray:"FaceMark",
    sideCursor_mray:true,
    requireRaycastHit:true,
    icon:{
      sheet:"editoricons",
      row:2,
      col:1
    },
  })
  
  defineTool({
    type:"settings",
    name:"Settings",
    editorOnly:true,
    pickModes:["xz", "xy", "yz", "mray"],
    alignMode:"none",
    pickIn:true,
    routine:"settings",
    icon:{
      sheet:"editoricons",
      row:2,
      col:2
    },
  })
  
  let serialize = function() {
    let o = {
      EKVX2:true,
      DataType:edCTL.DataType,
      Version:edCTL.DataVersion,
      Settings:Settings,
      Templates:templates,
      Memos:memos,
      Surfaces:surfaceDefs,
      Terrains:terrainDefs,
      Objects:[],
    }
    vxc.forAll((ctn)=>{
      if (ctn.contents && ctn.contents.length > 0) {
        for (let obj of (ctn.contents)) {
          if (obj.data) {
            o.Objects.push(obj.data)
          }
        }
      }
    })
    //return JSON.stringify(o, undefined, 2)
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
  
  //load ekvx2 data from a JSON string and supposedly reconstruct all relevant editor state from the time of its serialization.
  var importData = function(src) {
    let data = JSON.parse(src)
    if (!data || !data.EKVX2) {
      console.log("ERROR: input data is not a valid EKVX2 data", src)
      return
    }
    if (data.DataType != edCTL.DataType) {
      console.log(`ERROR: Ekvxed2 is not configured to load/edit data type "${data.DataType}"`)
      return
    }
    
    reset()
    
    
    // copy data off the parsed object
    templates = data.Templates
    surfaceDefs = data.Surfaces
    terrainDefs = data.Terrains
    memos = data.Memos
    Settings = data.Settings
    
    for (let memoid in memos) {
      memoid = Number.parseInt(memoid)
      
      if (memoid >= next_memoID) {
        next_memoID = memoid+1
      }
      memoIDs[JSON.stringify(memos[memoid])] = memoid
    }
    
    for (let sfcdefid in surfaceDefs) {
      sfcdefid = Number.parseInt(sfcdefid)
      
      let sfcdef = surfaceDefs[sfcdefid]
    
      //ensure unique surface identifiers can be generated after the import
      if (sfcdefid >= next_sfcid) {
        next_sfcid = sfcdefid+1
      }
      // de-memoize the surface definition
      if (typeof(sfcdef.tile) == "number") {
        sfcdef.tile = memos[sfcdef.tile]
      }
      if (typeof(sfcdef.area8b) == "number") {
        sfcdef.area8b = memos[sfcdef.area8b]
      }
      
      // prepare BoxTerrain params / surface definition state data
      let fdef = Object.assign({}, sfcdef)
      let sfc = bxtbldr.build_Sfcdef(fdef)
      surfaceDefs_bterr[sfcdefid] = sfc
      let sk = JSON.stringify(sfcdef)
      sfcIDs[sk] = sfcdefid
    }
    
    
    for (let obj of data.Objects) {
    
      let [templateID, x,y,z] = obj.$
      let template = templates[templateID]
      let tool = tools[template.toolname]
      
      if (tool.terrain) {
        let terrainID = obj.$[4]
        let terr = terrains[terrainID]

        // if the terrain is not yet reconstructed, build terrain data structures
        //    (abbreviated version of defineTerrain())
        if (!terr) {
          if (terrainID >= next_terrainid) {
            next_terrainid = terrainID+1
          }
          let sfcdefids = terrainDefs[terrainID]
          let comps = {}
          
          if (tool.components.all) {
            comps.all = surfaceDefs[sfcdefids[0]]
          }
          if (activeTool.components.horiz) {
            comps.horiz = surfaceDefs[sfcdefids[4]]
          }
          if (activeTool.components.vert) {
            comps.vert = surfaceDefs[sfcdefids[0]]
          }
          if (activeTool.components.up) {
            comps.up = surfaceDefs[sfcdefids[4]]
          }
          if (activeTool.components.north) {
            comps.north = surfaceDefs[sfcdefids[0]]
          }
          if (activeTool.components.east) {
            comps.east = surfaceDefs[sfcdefids[1]]
          }
          if (activeTool.components.south) {
            comps.south = surfaceDefs[sfcdefids[2]]
          }
          if (activeTool.components.west) {
            comps.west = surfaceDefs[sfcdefids[3]]
          }
          if (activeTool.components.down) {
            comps.down = surfaceDefs[sfcdefids[5]]
          }
          
          let sfcdefs = [
            surfaceDefs_bterr[sfcdefids[0]],
            surfaceDefs_bterr[sfcdefids[1]],
            surfaceDefs_bterr[sfcdefids[2]],
            surfaceDefs_bterr[sfcdefids[3]],
            surfaceDefs_bterr[sfcdefids[4]],
            surfaceDefs_bterr[sfcdefids[5]]
          ]
          
          let tk = JSON.stringify(tool.spec.terrain) + "|" + JSON.stringify(comps)
          terr = terrains[terrainID] = terrains[tk] = bxtbldr.build_Terraindef.apply(bxtbldr, sfcdefs)
          
          terr.sfcdefs = sfcdefs
          terr.sfcdefids = sfcdefids
        }
        // use the internal _build() to make the new editor object
        //    (the parsed JSON object could be recycled, but that was determined to not be worth the effort)
        _build(tool, x, y, z, 0,0,0, terr, terrainID)
      }
      else {
        let up, forward
        if ((tool.spec.alignMode != "none") && (activeTool.spec.alignMode != undefined)) {
          up = obj.$[4]
          forward = obj.$[5]
        }
        let components = {}
        for (let k in obj) {
          if (k != '$') {
            components[k] = deepcopy(obj[k])
          }
        }
        // use the internal _build() to make the new editor object
        _build(tool, x,y,z, up, forward, components)
      }
    }
  }
})





















