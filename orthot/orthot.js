export { renderCTL, inputCTL, sviewCTL, orthotCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, storeAsset, 
  pickPlanepos, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { direction } from '../libek/direction.js'
import { Hackground } from '../libek/hackground.js'
import { clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'

import { Zone } from './zone.js'
import { configureTextDisplay, activateTextDisplay, deactivateTextDisplay, setTextDisplayLocale } from './textdisplay.js'

/*  Orthot III application logic
    This prepares global controls, loads game data, configures base objects (default materials),
*/

// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = window.rctl = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = window.ictl = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

//Level data, high-level state, and "Orthot" functions
var orthotCTL = window.octl = {
  assets:{},
  tiles:{},
  version:"0.3.0",
  event:new EventTarget(),
  texts:{},
  fixedTexts:{}   //non-overrideable texts
}


$(async function MAIN() {

  initLIBEK()

  let disp_elem = $("#game").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)


  configureTextDisplay($("#textdisplay")[0], disp_elem)
  //activateTextDisplay(`A S D F`)
  
  //renderCTL.display.renderer.setClearColor( "blue", 0.1 )
  //console.log(renderCTL)

  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  
  let MAIN_ZONES = {}
  let MAIN_TEXTS = {}
  try {
    // Asset management - check assets/verison.txt, compare everything with stored version numbers
    //  If the version is old, use fetch option {cache:"reload"} to force a reload of any old data
    //  Otherwise, use default fetch options
    // While so doing, setup an asynchronous download of everything (and wait for everything to be completed)
    //  Should probably run some sort of display hack and show a progress bar while waiting.
    let dver_file = await fetchText("assets/version.txt", {cache:"no-store"})
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
      let prev_ver = 0|parseInt(window.localStorage[propname+"VER"])
      let result = await loadit((curr_ver > prev_ver) ? reloadOPT : undefined)
      return result
    }
    
    // call each update, but aggregate all the promises
    let promises = [
      update("texture", (fetchOPTS)=>{
        return loadMuch(
          orthotCTL.assets,
          fetchOPTS,
          {url:"assets/textures/patterns.png", properties:TextureProps},
          {url:"assets/textures/wall_8bit_fg.png", properties:TextureProps},
          {url:"assets/textures/symbols.png", properties:TextureProps},
        )
      }),
      update("model", (fetchOPTS)=>{
        return loadZIP(orthotCTL.assets, 'assets/models.zip', fetchOPTS)
      }),
      update("ekvx", (fetchOPTS)=>{
        return loadZIP(MAIN_ZONES, 'assets/ekvxdat.zip', fetchOPTS)
      }),
      update("text", (fetchOPTS)=>{
        return loadMuch(
          orthotCTL.assets,
          fetchOPTS,
          {url:"assets/maintexts.atxt"},
        )
      }),
    ]
    
    // Whene everything is loaded, update local storage with the versions of the cached files
    await Promise.all(promises)
    console.log("Loaded Orthot III data")
    for (let name in current_versions) {
      window.localStorage[name+"VER"] = current_versions[name]
    }
  }
  catch(err) {
    console.log("FAILED to load Orthot III data because:", err)
    return
  }
  
  let setupMainTexts = function(src) {
    orthotCTL.texts = {}
    for (let block of src) {
      orthotCTL.texts[block.name] = block
    }
  }
  setupMainTexts(orthotCTL.assets.maintexts)
  
  orthotCTL.forceReloadMaintexts = async function() {
    let txts = {}
    await loadMuch(
      txts,
      {cache:"reload"},
      {url:"assets/maintexts.atxt"},
    )
    setupMainTexts(txts.maintexts)
  }

  //console.log("TEST-TXTLOADER---------")
  //let testTXT = await load("orthot/test4.atxt", undefined, {cache:"reload"})
  //console.log("---------TEST-TXTLOADER")

  orthotCTL.tiles.key = {
    source:orthotCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }

  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]

  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:orthotCTL.assets.wall_8bit_fg,
    bkgtex:orthotCTL.assets.patterns,
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

  let manmats = ["hsl(25, 80%, 60%)", "blue", "hsl(15, 100%, 15%)", "black", {color:"black", metalness:1}, {color:"white", emissive:"yellow", emissiveIntensity:1}]

  assignMaterials(orthotCTL.assets.man, manmats)
  assignMaterials(orthotCTL.assets.man2, manmats)
  assignMaterials(orthotCTL.assets.man_walk, manmats)
  assignMaterials(orthotCTL.assets.man_push, manmats)
  assignMaterials(orthotCTL.assets.man_pushwalk, manmats)
  assignMaterials(orthotCTL.assets.man_climb, manmats)
  assignMaterials(orthotCTL.assets.man_leap, manmats)
  assignMaterials(orthotCTL.assets.man_pushleap, manmats)
  assignMaterials(orthotCTL.assets.man_slide1, manmats)
  assignMaterials(orthotCTL.assets.man_slide2, manmats)
  assignMaterials(orthotCTL.assets.man_slide3, manmats)
  assignMaterials(orthotCTL.assets.man_slide4, manmats)
  assignMaterials(orthotCTL.assets.man_slide5, manmats)

  let flag = getAsset(orthotCTL.assets, "FlagPlain")
  storeAsset(orthotCTL.assets, "flag", flag)
  assignMaterials(flag, ["brown", "white"])

  assignMaterials(orthotCTL.assets.scene_portal, {color:"yellow", emissive:"yellow", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5})
  assignMaterials(orthotCTL.assets.EndBlock, {color:"yellow", emissive:"yellow", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5})
  orthotCTL.assets.EndBlock.children[0].scale.x *= -1

  assignMaterials(orthotCTL.assets.portal_pane, "white", "yellow", {color:"blue", transparent:true, opacity:0.25}, "white" )
  assignMaterials(orthotCTL.assets.pushblock, ["white", "red", "black"])
  assignMaterials(orthotCTL.assets.lock, ["white", "black"])
  assignMaterials(orthotCTL.assets.crate, ["hsl(20, 100%, 50%)", "black", "hsl(25, 90%, 25%)", "hsl(22, 100%, 55%)" ])
  assignMaterials(orthotCTL.assets.iceblock, [{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}])
  assignMaterials(orthotCTL.assets.icefloor, [{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}, "black"])
  assignMaterials(orthotCTL.assets.mouse, ["hsl(20, 100%, 50%)", "hsl(0, 100%, 70%)", {color:"green", emissive:"green", emissiveIntensity:1}, "hsl(30, 100%, 20%)"])
  assignMaterials(orthotCTL.assets.moose, ["hsl(20, 100%, 50%)", "black", "hsl(30, 100%, 20%)", {color:"red", emissive:"red", emissiveIntensity:1}])
  
  assignMaterials(orthotCTL.assets.InfoBlockBase, ["green", "yellow"])
  assignMaterials(orthotCTL.assets.InfoQMark, ["yellow"])

  let markmats = [{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]

  assignMaterials(orthotCTL.assets.CubeMark, markmats)
  assignMaterials(orthotCTL.assets.FaceMark, markmats)
  assignMaterials(orthotCTL.assets.CubeCursor, cursormats)
  assignMaterials(orthotCTL.assets.FaceCursor, cursormats)

  inputCTL.keystate = new QueryTriggeredButtonControl({
    buttons:".wasd arrows space",
    readheldbuttons:true,
    onInputAvailable:function() {
      if (orthotCTL.ActiveZone) {
        orthotCTL.ActiveZone.inputAvailable()
      }
    }
  })
  inputCTL.keystate.run()

  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:orthotCTL.event,
    evttarget:orthotCTL.event,
    pickplane:new THREE.Plane(direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"lmb",
    RefocusTargetMBTN:"mmb",
    RefocusUpdatepickplane:true,
    RefocusLen:700,
    QuickRefocusLen:150,

    tpmode_fov:60,
    fpmode_fov:75,
    fpmode_enabled:true,
    fpmode_abs_offset:new THREE.Vector3(0,0.25,0),
    fpmode_z_offset:-0.5,
    fpmode_notify:function(fpmode_on, fpmode_moused) {
      if (orthotCTL.ActiveZone) {
        orthotCTL.ActiveZone.setFPmode(fpmode_on, fpmode_moused)
      }
    }
  })
  sviewCTL.run()

  let levelSelector = $("#loadPuzzle")[0]


  orthotCTL.loadScene = function(arg, loc) {
    let ekvx = arg
    if (typeof(arg) == "string") {
      ekvx = orthotCTL.gdatapack.zones[arg]
      if (ekvx == undefined) {
        console.log(`No puzzle named "${arg}" to load...  Loading the default (MainArea)`)
        arg = orthotCTL.gdatapack.mainAreaname
        ekvx = orthotCTL.gdatapack.zones[arg]
      }
    }
    else if (!arg) {
      arg = orthotCTL.gdatapack.mainAreaname
      ekvx = orthotCTL.gdatapack.zones[arg]
    }
    if (orthotCTL.ActiveZone) {
      renderCTL.display.scene.remove(orthotCTL.ActiveZone.scene)
      orthotCTL.ActiveZone.unload()
    }
    orthotCTL.ActiveZone = new Zone(ekvx, loc, arg)
    renderCTL.display.scene.add(orthotCTL.ActiveZone.scene)

    for (let i = 0; i < levelSelector.length; i++) {
      if (levelSelector.options[i].value == arg) {
        levelSelector.selectedIndex = i
        return
      }
    }
    levelSelector.selectedIndex = -1
  }

  let loadProgress = function() {
    let prgdata = window.localStorage["progress."+orthotCTL.gdatapack.name]
    if (prgdata) {
      orthotCTL.gdatapack.progress = JSON.parse(prgdata)
    }
    else {
      orthotCTL.gdatapack.progress = {}
    }
  }

  let storeProgress = function() {
    window.localStorage["progress."+orthotCTL.gdatapack.name] = JSON.stringify(orthotCTL.gdatapack.progress)
  }
  orthotCTL.addProgress = function(code) {
    orthotCTL.gdatapack.progress[code] = true
    storeProgress()
  }
  orthotCTL.unProgress = function(code) {
    delete orthotCTL.gdatapack.progress[code]
    storeProgress()
  }
  orthotCTL.nukeProgress = function() {
    orthotCTL.gdatapack.progress = {}
    storeProgress()
  }

  orthotCTL.matchCode = function(code) {
    if (code == "") {
      return true
    }

    // Orthot II accepted a wide range of separators (due to codes being a manually input field):  "-,:;|", as well as newline and formfeed
    //  It also accepted a space, but only for the command (spaces are valid in puzzle names)
    //  The min and max options further complicated this.
    let args, codes
    let sepOption = function(s) {
      let idx = s.search(/[ ,:;|\n\r\-]/)
      if (idx == -1) {
        return false
      }
      args = s.substring(idx+1)
      return s.substring(0, idx)
    }
    let sepCodes = function() {
      codes = args.split(/[,:;|\n\r\-]/)
      for (let i = codes.length-1; i >= 0; i--) {
        if (codes[i] == "") {
          codes.splice(i,1)
        }
      }
    }
    let command = sepOption(code)
    if (command) {
      let count = 0
      let constraint = 0
      switch (command) {
        case "any":
          sepCodes()
          for (let i = 0; i < codes.length; i++) {
            if (orthotCTL.gdatapack.progress[codes[i]]) {
              return true
            }
          }
          return false
        break
        case "all":
          sepCodes()
          for (let i = 0; i < codes.length; i++) {
            if (!orthotCTL.gdatapack.progress[codes[i]]) {
              return false
            }
          }
          return true
        break
        case "min":
          constraint = parseFloat(sepOption(args))
          sepCodes()
          for (let i = 1; i < codes.length; i++) {
            if (orthotCTL.gdatapack.progress[codes[i]]) {
              count++
            }
          }
          return count >= constraint
        break
        case "max":
          constraint = parseFloat(sepOption(args))
          sepCodes()
          for (let i = 1; i < codes.length; i++) {
            if (orthotCTL.gdatapack.progress[codes[i]]) {
              count++
            }
          }
          return count <= constraint
        break
      }
    }
    return orthotCTL.gdatapack.progress[code]
  }

  on($("loadPuzzle"), "input", ()=>{
    let lvlName = levelSelector.options[levelSelector.selectedIndex].value
    orthotCTL.loadScene(lvlName)
    disp_elem.focus()
  });


  let loadDataPack = function(packname, mainareaname, data, texts) {
    orthotCTL.gdatapack = {
      name:packname,
      mainAreaname:mainareaname,
      zones:data,
      texts:texts
    }
    loadProgress()

    for (let i = levelSelector.length-1; i >= 0; i--) {
      levelSelector.remove(i)
    }
    for (let name in orthotCTL.gdatapack.zones) {
      levelSelector.add($("<option>").text(name)[0])
    }
  }

  loadDataPack("MainGdataPack", "MainArea", MAIN_ZONES, MAIN_TEXTS)
  orthotCTL.loadScene("MainArea")

  orthotCTL.forceReloadMainData = async function() {
    let zones = {}
    let texts = {}
    await loadZIP(zones, orthotCTL.texts, 'assets/ekvxdat.zip', {cache:"reload"})
    loadDataPack("MainGdataPack", "MainArea", zones, texts)
    orthotCTL.loadScene("MainArea")
  }

  let highRespModeBTN = $("<div>").addClass("btn_inactive").text("Hi-Resp:OFF")

  on(highRespModeBTN, "click", ()=>{
    if (orthotCTL.highResponsiveMode) {
       orthotCTL.highResponsiveMode = false
       highRespModeBTN.text("Hi-Resp:OFF").removeClass("btn_active").addClass("btn_inactive")
    }
    else {
     orthotCTL.highResponsiveMode = true
     highRespModeBTN.text("Hi-Resp:ON").removeClass("btn_inactive").addClass("btn_active")
    }
  })

  let resetBTN = $("<div>").addClass("btn_active").text("Reset").click(function() {
    if (orthotCTL.ActiveZone) {
      orthotCTL.ActiveZone.reset()
      disp_elem.focus()
    }
  })

  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }

  on($("#hideabout"), "click", toggleAboutBox)

  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]

  highRespModeBTN[0].title = "High-Responsive Mode"
  resetBTN[0].title = "Restart the active puzzle"

  $("#controls").append(highRespModeBTN)
  $("#controls").append(resetBTN)
  $("#controls").append(aboutBTN)


  let faderID
  let completionELEM = $("#completionGraphic")[0]
  completionELEM.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )

  let busy = false
  renderCTL.indicateCompletion = async function() {
    if (busy) {
      console.log("BAH!  They can't wreck my puzzles that quickly... can they?")
      return
    }
    completionELEM.style.display = "block"
    busy = true
    completionELEM.style.opacity = 0
    let opa = 0
    let incr = 1/10
    for (let i = 0; i < 10; i++) {
      await next(orthotCTL.event, "frame")
      opa += incr
      completionELEM.style.opacity = opa
    }
    completionELEM.style.opacity = 1
    for (let i = 0; i < 50; i++) {
      await next(orthotCTL.event, "frame")
    }
    incr = 1/30
    for (let i = 0; i < 30; i++) {
      await next(orthotCTL.event, "frame")
      opa -= incr
      completionELEM.style.opacity = opa
    }
    busy = false
    completionELEM.style.display = "none"
  }

  renderCTL.build_domOBJ = function(tile, color, location, css_class, event_handlers) {
    if (typeof(tile) == "string") {
      tile = orthotCTL.tiles[tile]
    }
    if (!tile) {
      return
    }
    if (!color) {
      color = new THREE.Color("white")
    }
    else if (!color.isColor) {
      color = new THREE.Color(color)
    }
    if (!location) {
      location = "#inventory"
    }

    let cnv = document.createElement("canvas")
    let elem = $(cnv)
    if (css_class) {
      elem.addClass(css_class)
    }
    if (event_handlers) {
      for (let k in event_handlers) {
        elem.on(k, event_handlers[k])
      }
    }

    $(location).append(elem)

    cnv.width = UI_TILE_SIZE[0]
    cnv.height = UI_TILE_SIZE[1]

    let hilight = false

    //console.log(sz)
    let ctx = cnv.getContext('2d');
    let draw = function() {
      ctx.clearRect(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])

      if (hilight) {
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0

        ctx.strokeStyle = "black"
        ctx.lineWidth = 4
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)

        ctx.strokeStyle = color.getStyle()
        ctx.lineWidth = 2
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)
      }

      ctx.shadowColor = 'rgba(0, 0, 0, .33333)';
      ctx.shadowOffsetX = UI_TILESHADOW_OFFSET[0]
      ctx.shadowOffsetY = UI_TILESHADOW_OFFSET[1]
      ctx.drawImage(tile.source, tile.x, tile.y, tile.w, tile.h, UI_TILEGRAPHIC_OFFSET[0], UI_TILEGRAPHIC_OFFSET[1], UI_TILEGRAPHIC_SIZE[0], UI_TILEGRAPHIC_SIZE[1]);

      let imgd = ctx.getImageData(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])
      let buf = imgd.data

      let r = color.r
      let g = color.g
      let b = color.b

      for (let i = 0; i < buf.length; i+= 4) {
        buf[i] =   buf[i]   * r
        buf[i+1] = buf[i+1] * g
        buf[i+2] = buf[i+2] * b
      }
      ctx.putImageData(imgd, 0, 0);

    }
    draw()

    elem.mouseover(function() {
      hilight = true
      draw()
    })
    elem.mouseout(function() {
      hilight = false
      draw()
    });

    return elem
  }

  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  let shownItem
  let tiptext = ""
  orthotCTL.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      orthotCTL.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }
  orthotCTL.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }

  orthotCTL.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
    }
  }

  let rotate = function(val, amt) {
    return (val<<amt)&0xffffffff | (val>>(32-amt))
  }
  let inthashRand = function(v) {
    v += 0x01234567
    v *= 0x811c9dc5
    v &= 0xffffffff
    v ^= rotate(v, 7)
    v += 0x01234567
    v &= 0xffffffff
    v ^= rotate(v, 11)
    v += 0x01234567
    v &= 0xffffffff
    v ^= rotate(v, 23)
    v += 0x01234567
    v &= 0xffffffff
    v /= (2**32)
    v += 0.5
    return v
  }

  let pRandPlatues = function(... args) {
    let tw = 0
    for (let i = 0; i < args.length; i+= 2) {
      tw += args[i+1]
    }
    return function(col, numCols) {
      let x = col/numCols
      let r = 0
      for (let i = 0; i < args.length; i+= 2) {
        let f = args[i]
        let w = args[i+1]
        r += inthashRand(Math.floor(x*f))*w
      }
      return r/tw
    }
  }

  let mixRandSin = function(sinFrequency, sineWeight, randWeight) {
    let tw = randWeight+sineWeight
    sinFrequency = sinFrequency*Math.PI*2
    return function(col, numCols) {
      return (Math.sin(sinFrequency*col/numCols)/(Math.PI)*sineWeight + Math.random()*randWeight)/tw
    }
  }

  let hg = new Hackground(renderCTL.display.background)
  renderCTL.bkg = hg
  hg.yOFS = 0
  hg.bkgColor = "black"
  hg.layers = [
    { baseOfs:0,
      baseGen:mixRandSin(0.333,1,0),
      range:0.2,
      auxGen:pRandPlatues(7,5,11,6,13,7,17,8,19,9),
      auxRange:0.05,
      gradGen:mixRandSin(3,4,3),
      gradients:[
        {
          pos:-1,
          color:"black"
        },
        {
          pos:-0.33,
          color:"black"
        },
        {
          pos:-0.1,
          color:"purple",
          range:0.005
        },
        {
          pos:-0.05,
          color:"pink",
          range:0.015
        },
        {
          pos:0,
          color:"lightblue",
          startColor:"yellow",
          range:0.01
        },
        {
          pos:0,
          color:"lightblue",
          startColor:"cyan",
          range:0.005
        },
        {
          pos:0.05,
          color:"lightblue",
          range:0.02
        },
        {
          pos:0.15,
          color:"darkblue",
          startColor:"blue",
          range:0.005
        },
        {
          pos:0.35,
          color:"darkblue",
          startColor:"lime",
          range:0.025
        },
        {
          pos:0.4,
          color:"green",
          startColor:"darkgreen",
          range:0.025
        },
        {
          pos:0.45,
          color:"black",
          startColor:"yellow",
          gen:mixRandSin(1,7,3),
          range:0.015
        },
        {
          pos:0.45,
          color:"orange",
          startColor:"hsl(30,100%,50%)",
          range:0.005
        },
        {
          pos:0.5,
          color:"hsl(30,100%,33%)",
          range:0.005
        },
        {
          pos:0.533,
          color:"hsl(30,100%,20%)",
          range:0.005
        },
        {
          pos:0.567,
          color:"hsl(30,100%,10%)",
          range:0.005
        },
        {
          pos:0.6,
          color:"black",
          range:0.005
        },
        {
          pos:0.68,
          color:"black",
          startColor:"hsl(20,70%,20%)",
          range:0.015
        },
        {
          pos:0.7,
          color:"hsl(20,70%,8%)",
          range:0.005
        },
        {
          pos:0.8,
          color:"hsl(20,70%,4%)",
          range:0.03
        },
        {
          pos:0.9,
          color:"hsl(20,70%,2%)",
          range:0.03
        },
        {
          pos:1,
          color:"black",
          range:0.05
        },
        {
          pos:1.2,
          color:"black",
          startColor:"hsl(0,100%,5%)",
          gen:mixRandSin(0.15,3,7),
          range:0.1
        },
        {
          pos:1.4,
          color:"hsl(330,100%,2.5%)",
          range:0.05
        },
        {
          pos:1.5,
          color:"black"
        },
        {
          pos:3,
          color:"black"
        }
      ]
    }
  ]
  hg.resolution = 12
  //hg.update()
  hg.draw()
  let hgyscale = -1000
  let hgxscale = 200
  //hg.rotate(15)
  let prevCamPhi = sviewCTL.campos.phi
  let prevCamTheta = sviewCTL.campos.theta
  hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
  hg.update()

  var run = function run () {
    requestAnimationFrame( run );
    orthotCTL.event.dispatchEvent(new Event("frame"))

    if (orthotCTL.ActiveZone) {
      orthotCTL.ActiveZone.onFrame()
    }
    renderCTL.display.render()
    //hg.rotate(17/16)
    //console.log(sviewCTL.campos.phi)
    let camTheta = sviewCTL.campos.theta
    if (camTheta != prevCamTheta) {
      let hgRotamt = ((camTheta - prevCamTheta) / (2*Math.PI)) * (-hgxscale)
      prevCamTheta = camTheta
      prevCamPhi = sviewCTL.campos.phi
      //hg.offset += diff
      hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
      hg.rotate(hgRotamt)
      hg.update()
    }
    else if ( (prevCamPhi != sviewCTL.campos.phi) ) {
      prevCamPhi = sviewCTL.campos.phi
      hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
      hg.update()
    }

    //let mpos3d = pickPlanepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
    //debug_tip(`${tiptext}<br>
    //Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
  }
  run()

  //console.log(assets)
})





















