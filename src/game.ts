const DEBUG = false;

interface Navigator {
    [key: string]: any;
}

interface Coords {
    x: number;
    y: number;
}

interface Rectangle extends Coords {
    width: number;
    height: number;
}

interface GamepadMap {
    [key: string]: {
        axis: boolean;
        gameButtonName?: string;
        positiveGameButtonName?: string;
        negativeGameButtonName?: string;
    }
}

interface Ship {
    x: number;
    y: number;
    width: number;
    height: number;
    frame: number;
    image: HTMLImageElement;
    coords: Array<Coords>;
    frameTimer: number;
    xVelocity: number;
    yVelocity: number;
    score: number;
    hitbox: Rectangle;
    juicing: boolean;
    juice: number;
}

class Bullet {
    public isHit: boolean = false;

    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
        public xVelocity: number,
        public yVelocity: number,
        public lifespan: number) { }
}

class Butt extends Bullet {
    constructor(
        public image: HTMLImageElement,
        public scale: number,
        public direction: number,
        x: number,
        y: number,
        width: number,
        height: number,
        xVelocity: number,
        yVelocity: number
    ) {
        super(x, y, width, height, xVelocity, yVelocity, 0);
    }
}

let cooldowns: { [key: string]: number } = {};

function setCooldown(key: string, durationInTicks: number) {
    cooldowns[key] = durationInTicks;
}

function isCoolingDown(key: string): boolean {
    return key in cooldowns && cooldowns[key] > 0;
}

function cancelCooldown(key: string) {
    delete cooldowns[key];
}

function getCooldown(key: string): number {
    if (key in cooldowns) return cooldowns[key];
    return 0;
}

function loadImage(imgPath: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => {
            resolve(img);
        };
        img.onerror = function (err) {
            console.log('err', err)
        }
        img.src = imgPath;
    });
}

function getSpritesheetCoordinates(frameWidth: number, frameHeight: number, img: HTMLImageElement): Array<Coords> {
    let coords: Array<Coords> = [];

    for (let yIndex = 0; yIndex < img.height / frameHeight; yIndex++) {
        for (let xIndex = 0; xIndex < img.width / frameWidth; xIndex++) {
            coords.push({
                x: xIndex * frameWidth,
                y: yIndex * frameHeight
            });
        }
    }

    return coords;
}

function sleep(timeInMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeInMs);
    });
}

async function main(canvas: HTMLCanvasElement) {

    console.log('starting game...');

    let fontSSImage = await loadImage('/game/ss_font_16x16_74.png');
    let shipSSImage = await loadImage('/game/ss_syringe_8x8_12.png');
    let medicineImage = await loadImage('/game/medicine_8x8.png');
    let buttSSImage = await loadImage('/game/ss_butt_16x16_16.png');
    let armSSImage = await loadImage('/game/ss_arm_16x16_10.png');

    // Set up the canvas
    //let canvas = document.getElementById('game') as HTMLCanvasElement;
    canvas.width = 320;
    canvas.height = 192;
    let context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.font = '8px Arial';

    // get the font spritesheet.
    console.log('got font image');
    let fontCoords = getSpritesheetCoordinates(16, 16, fontSSImage);

    /*
      RIDICULOUS LETTER MAPPING TO USE A HACKY BITMAP FONT.
      capitals
      65-90 = 0-25 (original - 65)
  
      lowercase
      97-122 = 26-51 (original - 71)
  
      1-9
      49-57 = 52-60 (original + 3)
  
      0
      48 = 61 (original + 13)
  
      (	40 = 62
      !	33 = 63
      @	64 = 64
      $	36 = 65
      %	37 = 66
      &	38 = 67
      *	42 = 68
      ?	63 = 69
      ;	59 = 70
      :	58 = 71
      )	41 = 72  
    */
    function getGameFontCode(ascii: number) {
        if (ascii >= 65 && ascii <= 90) return ascii - 65;
        if (ascii >= 97 && ascii <= 122) return ascii - 71;
        if (ascii >= 49 && ascii <= 57) return ascii + 3;

        switch (ascii) {
            case 48:
                return 61;
            case 40:
                return 62;
            case 33:
                return 63;
            case 64:
                return 64;
            case 36:
                return 65;
            case 37:
                return 66;
            case 38:
                return 67;
            case 42:
                return 68;
            case 63:
                return 69;
            case 59:
                return 70;
            case 58:
                return 71;
            case 41:
                return 72;
            default:
                return 74; // 73 should be a blank character at the end of the spritesheet. 
        }
    }

    function drawCharacter(context: CanvasRenderingContext2D, x: number, y: number, ascii: number) {
        let code = getGameFontCode(ascii);
        context.drawImage(fontSSImage, fontCoords[code].x, fontCoords[code].y, 16, 16, x, y, 16, 16);
    }

    function drawString(context: CanvasRenderingContext2D, x: number, y: number, text: string) {
        for (let i = 0; i < text.length; i++) {
            drawCharacter(context, x + (16 * i), y, text.charCodeAt(i));
        }
    }

    function drawStringCentered(context: CanvasRenderingContext2D, y: number, text: string) {
        drawString(context, (canvas.width / 2) - ((text.length * 16) / 2), y, text);
    }

    // Build a ship.
    let ship: Ship = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        width: 8,
        height: 8,
        frame: 0,
        image: shipSSImage,
        coords: getSpritesheetCoordinates(8, 8, shipSSImage),
        frameTimer: 15,
        xVelocity: 0,
        yVelocity: 0,
        score: 0,
        hitbox: {
            x: 0,
            y: 0,
            width: 4,
            height: 4
        },
        juicing: false,
        juice: 100
    }


    let medicineCoord: Coords = {
        x: 0,
        y: 0
    };
    let isMedicineVisible = false;

    // Build the butthole-der.
    let butts: Array<Butt> = [];


    // Load the butt image.
    let buttSSCoords = getSpritesheetCoordinates(16, 16, buttSSImage);
    const buttSSDimensions = {
        width: 16,
        height: 16
    };


    let armSSCoords = getSpritesheetCoordinates(16, 16, armSSImage);
    const armSSDimensions = {
        width: 16,
        height: 16
    };

    console.log('game assets loaded');

    console.log(canvas);

    context.fillStyle = 'red';
    context.fillRect(0, 0, 320, 192);

    // Build the bullet holder
    let bullets: Array<Bullet> = [];


    // Map out the input
    let gameButtonState: {
        [key: string]: number;
    } = {
        up: 0,
        down: 0,
        left: 0,
        right: 0,
        inject: 0
    }

    let keyboardState: {
        [key: string]: boolean;
    } = {
        up: false,
        down: false,
        left: false,
        right: false,
        inject: false
    }

    let gamepadState: {
        [key: string]: boolean
    } = {};

    let connectedGamepads: {
        [key: string]: {
            gamepad: Gamepad;
            map?: GamepadMap;
        };
    } = {};

    let kbMap: {
        [key: number]: string;
    } = {
        38: 'up',
        40: 'down',
        37: 'left',
        39: 'right',
        32: 'inject'
    };

    let gameButtonNameList = [
        'up',
        'down',
        'left',
        'right',
        'inject'
    ];

    let gpMap: {
        [key: string]: {
            axis: boolean;
            threshold?: number;
            gameButtonName: string;
        };
    } = {};

    let controlPanel = document.getElementById('control-panel') as HTMLDivElement;

    function updateControllerMapDisplay() {
        // clear em out
        while (controlPanel.childNodes.length > 0) controlPanel.removeChild(controlPanel.childNodes[0]);

        for (let key in connectedGamepads) {
            let cgp = connectedGamepads[key];
            if (cgp.map) {
                let div = document.createElement('div'); // as HTMLDivElement;
                let button = document.createElement('button'); // as HTMLButtonElement;
                button.innerText = 'Clear Map for controller ' + cgp.gamepad.index;
                button.onclick = () => {
                    localStorage.removeItem('map-' + cgp.gamepad.id);
                    document.location.reload();
                }
                div.appendChild(button);
                controlPanel.appendChild(div);
            }
        }
    }

    let degreesToRadianValue = Math.PI / 180;

    function degreesToRadians(degrees: number): number {
        return (degrees + 270) * degreesToRadianValue;
    }

    // Pre calculate the x and y components for all available ship angles.
    var velocities: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < ship.coords.length; i++) {
        velocities.push({
            x: Math.sin(degreesToRadians(30 * i)),
            y: Math.cos(degreesToRadians(30 * i))
        });
    }

    function scanGamepads() {
        var gamepads: Array<Gamepad> = navigator.getGamepads ? navigator.getGamepads() : (navigator['webkitGetGamepads'] ? navigator['webkitGetGamepads']() : []);
        if (gamepads && gamepads.length > 0) {
            gamepads.forEach((gp) => {
                if (!connectedGamepads[gp.index + gp.id]) {
                    handleGamepadConnection({
                        gamepad: gp
                    })
                }
            });
        }
    }

    function handleGamepadConnection(e: { gamepad: Gamepad }) {
        console.log('handleGamepadConnection');
        let gamepadName = e.gamepad.index + e.gamepad.id;

        connectedGamepads[gamepadName] = {
            gamepad: e.gamepad
        }

        let mapString = localStorage.getItem('map-' + e.gamepad.id);
        if (mapString) {
            let map: GamepadMap = JSON.parse(mapString);
            if (map) {
                connectedGamepads[gamepadName].map = map;
                updateControllerMapDisplay();
            }
        }

        if (!connectedGamepads[gamepadName].map) {
            setTimeout(() => {
                configuringGamepad = gamepadName;
                configuringGamepadButton = 0;
            }, 1000);
        }
    }

    function handleKeydown(evt: KeyboardEvent) {
        if (kbMap[evt.keyCode]) {
            keyboardState[kbMap[evt.keyCode]] = true;
            //gameButtonState[keyMap[evt.keyCode]]++;
            evt.preventDefault();
        }
    }

    function handleKeyup(evt: KeyboardEvent) {
        if (kbMap[evt.keyCode]) {
            keyboardState[kbMap[evt.keyCode]] = false;
            //gameButtonState[keyMap[evt.keyCode]] = 0;
            evt.preventDefault();
        }
    }

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);


    let roundLoaded = false;
    let round = 1;
    let roundScore = 0;
    let isDemoMode = true;
    let configuringGamepad = '';
    let configuringGamepadButton = 0;
    let configuringGamepadWaitingForRelease = false;
    let demoFrame = 0;
    let isVictory = false;
    let victoryFrame = 0;

    // GAME LOOP STUFF
    function initializeRound() {
        roundScore = 0;
        butts = [];
        let buttCount = 5 + round;
        for (let i = 0; i <= buttCount; i++) {
            let velocity = 0.25 + Math.random();
            let scale = 0.5 + Math.random() * 1;
            let direction = Math.floor(Math.random() * 12);
            let rotation = Math.floor(Math.random() * buttSSCoords.length);
            butts.push(new Butt(buttSSImage, scale, rotation, Math.random() * canvas.width, Math.random() * canvas.height, buttSSDimensions.width * scale, buttSSDimensions.height * scale, velocity * velocities[direction].x, velocity * velocities[direction].y))
        }
        roundLoaded = true;
        ship.juice = 100;
        ship.juicing = false;

        isMedicineVisible = false;
    }

    function updateGamepadConfig() {
        if (configuringGamepadWaitingForRelease) {
            if (configuringGamepad && connectedGamepads[configuringGamepad] && connectedGamepads[configuringGamepad].gamepad) {
                let buttonPressed = false;
                let gp = connectedGamepads[configuringGamepad].gamepad;
                for (let i = 0; i < gp.axes.length; i++) {
                    if (Math.abs(gp.axes[i]) > 0.99) {
                        buttonPressed = true;
                        break;
                    }
                }

                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed || gp.buttons[i].value !== 0) {
                        buttonPressed = true;
                        break;
                    }
                }

                if (!buttonPressed) {
                    configuringGamepadButton++;
                    configuringGamepadWaitingForRelease = false;
                    if (configuringGamepadButton >= gameButtonNameList.length) {
                        localStorage.setItem('map-' + gp.id, JSON.stringify(connectedGamepads[configuringGamepad].map));
                        configuringGamepad = '';
                        updateControllerMapDisplay();
                    }
                }
            }

        } else {
            if (connectedGamepads[configuringGamepad] && connectedGamepads[configuringGamepad].gamepad) {
                let gp = connectedGamepads[configuringGamepad].gamepad;
                let buttonPressFound = false;
                if (!connectedGamepads[configuringGamepad].map) connectedGamepads[configuringGamepad].map = {};

                let map = connectedGamepads[configuringGamepad].map as GamepadMap;

                for (let i = 0; i < gp.axes.length; i++) {
                    if (gp.axes[i] > 0.99) {
                        if (!map['axis-' + i]) {
                            map['axis-' + i] = {
                                axis: true
                            };
                        }
                        map['axis-' + i].positiveGameButtonName = gameButtonNameList[configuringGamepadButton];
                        buttonPressFound = true;
                        break;
                    } else if (gp.axes[i] < -0.99) {
                        if (!map['axis-' + i]) {
                            map['axis-' + i] = {
                                axis: true
                            };
                            map['axis-' + i].negativeGameButtonName = gameButtonNameList[configuringGamepadButton];
                        }
                        buttonPressFound = true;
                        break;
                    }
                }

                if (!buttonPressFound) {
                    for (let i = 0; i < gp.buttons.length; i++) {
                        if (gp.buttons[i].pressed || gp.buttons[i].value > 0) {
                            map['button-' + i] = {
                                axis: false,
                                gameButtonName: gameButtonNameList[configuringGamepadButton]
                            }
                            buttonPressFound = true;
                            break;
                        }
                    }
                }

                if (buttonPressFound) configuringGamepadWaitingForRelease = true;
            }
        }
    }

    function updateGamepadState() {
        for (let key in gamepadState) {
            gamepadState[key] = false;
        }

        for (let key in connectedGamepads) {
            let cgp = connectedGamepads[key];
            if (cgp.map) {
                let gp = cgp.gamepad;
                for (let i = 0; i < gp.axes.length; i++) {
                    if (cgp.map['axis-' + i]) {
                        if (gp.axes[i] > 0.99) gamepadState[cgp.map['axis-' + i].positiveGameButtonName as string] = true;
                        else if (gp.axes[i] < -0.99) gamepadState[cgp.map['axis-' + i].negativeGameButtonName as string] = true;
                    }
                }
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (cgp.map['button-' + i]) {
                        if (gp.buttons[i].pressed || gp.buttons[i].value > 0) gamepadState[cgp.map['button-' + i].gameButtonName as string] = true;
                    }
                }
            }
        }
    }

    function updateInput() {
        scanGamepads();
        updateGamepadState();

        for (let key in gameButtonState) {
            if (keyboardState[key] || gamepadState[key]) gameButtonState[key]++;
            else gameButtonState[key] = 0;
        }
    }

    function updateCooldowns() {
        for (let key in cooldowns) {
            if (cooldowns[key] > 0) cooldowns[key]--;
        }
    }

    function updateButts() {
        butts = butts.filter(b => {
            b.x += b.xVelocity;
            b.y += b.yVelocity;

            if (b.x < -1 * (b.width / 2)) b.x = canvas.width + (b.width / 2);
            else if (b.x > canvas.width + (b.width / 2)) {
                b.x = -1 * (b.width / 2);
                console.log('width: ' + b.width + ', new x: ' + b.x);
            }

            if (b.y < -1 * (b.height / 2)) b.y = canvas.height + (b.height / 2);
            else if (b.y > canvas.height + (b.height / 2)) b.y = -1 * (b.height / 2);

            return !b.isHit;
        });
    }

    function update(timestamp: number) {

        if (isCoolingDown('lose')) {
            if (getCooldown('lose') == 1) isDemoMode = true;
            else return;
        }

        if (!roundLoaded && !isCoolingDown('show-get-ready')) {
            initializeRound();
            setCooldown('butt-flicker', 60);
        }

        // Update the medicine bottle.
        if (!isCoolingDown('medicine') && !isMedicineVisible) {
            medicineCoord.x = Math.floor(Math.random() * canvas.width);
            medicineCoord.y = Math.floor(Math.random() * canvas.height);
            isMedicineVisible = true;
        }

        // UPDATE SHIP
        if ((!isCoolingDown('p1-right') || isCoolingDown('bounce')) && gameButtonState.right > 0) {
            ship.frame++;
            setCooldown('p1-right', 5);
        }

        if ((!isCoolingDown('p1-left') || isCoolingDown('bounce')) && gameButtonState.left > 0) {
            ship.frame--;
            setCooldown('p1-left', 5);
        }

        if (ship.frame >= ship.coords.length) ship.frame = 0;
        else if (ship.frame < 0) ship.frame = ship.coords.length - 1;

        // Change velocity AFTER checking that the ship frame is a valid value otherwise it'll end up being a value outside valid range at some point.
        if (!isCoolingDown('p1-up') && gameButtonState.up > 0) {

            ship.xVelocity += 0.1 * velocities[ship.frame].x;
            ship.yVelocity += 0.1 * velocities[ship.frame].y;
            setCooldown('p1-up', 5);

            let velocity = Math.sqrt(Math.pow(ship.xVelocity, 2) + Math.pow(ship.yVelocity, 2));
            if (velocity > 2.7) {
                let factor = 2.7 / velocity;
                ship.xVelocity *= factor;
                ship.yVelocity *= factor;
            }
        }

        ship.x += ship.xVelocity;
        ship.y -= ship.yVelocity;

        ship.hitbox.x = ship.x - (ship.hitbox.width / 2) + (velocities[ship.frame].x * 6);
        ship.hitbox.y = ship.y - (ship.hitbox.height / 2) - (velocities[ship.frame].y * 6);

        if (ship.x < -1 * (ship.width / 2)) ship.x = canvas.width + (ship.width / 2);
        else if (ship.x > canvas.width + (ship.width / 2)) ship.x = -1 * (ship.width / 2);

        if (ship.y < -1 * (ship.height / 2)) ship.y = canvas.height + (ship.height / 2);
        else if (ship.y > canvas.height + (ship.height / 2)) ship.y = -1 * (ship.height / 2);

        if (ship.juicing) ship.juice--;

        ship.juicing = (gameButtonState.inject > 0 && ship.juice > 0 && !isCoolingDown('butt-flicker') && !isCoolingDown('show-get-ready'));

        checkForCollisions();

        // UPDATE BULLETS - falsed out because there's no bullets now.
        /*
        if (!isCoolingDown('show-get-ready') && !isCoolingDown('p1-inject') && gameButtonState.inject > 0 && bullets.length < 10) {
    
          let frame = ship.frame;
          if (frame < velocities.length) {
            bullets.push(new Bullet(ship.x + velocities[frame].x, ship.y - velocities[frame].y, 3, 3, velocities[frame].x, velocities[frame].y, 75));
            setCooldown('p1-inject', 7);
          } else {
            console.log('No velocity for frame ' + ship.frame + '\n' + JSON.stringify(velocities, null, 2));
          }
    
        }
        */

        bullets = bullets.filter(b => {
            b.x += 4 * b.xVelocity;
            b.y -= 4 * b.yVelocity;
            b.lifespan--;

            if (b.x < -1 * b.width / 2) b.x = canvas.width + b.width / 2;
            else if (b.x > canvas.width + b.width / 2) b.x = -1 * b.width / 2;

            if (b.y < -1 * b.height / 2) b.y = canvas.height + b.height / 2;
            else if (b.y > canvas.height + b.height / 2) b.y = -1 * b.height / 2;

            return b.lifespan > 0 && !b.isHit;
        });

        updateButts();

        // CHECK FOR WIN STATE
        if (butts.length == 0 && !isCoolingDown('show-get-ready') && roundLoaded) {
            roundLoaded = false;
            bullets = [];
            setCooldown('show-get-ready', 80);
            round++;
            if (round == armSSCoords.length) {
                isVictory = true;
                setCooldown('pause-for-victory', 80);
            }
        }

    }

    function updateDemo() {
        demoFrame++;
        updateButts();
        if (gameButtonState.inject > 0) {
            isDemoMode = false;
            round = 0;
            roundLoaded = false;
            roundScore = 0;
            ship.score = 0;
            butts = [];
            setCooldown('show-get-ready', 80);
        }
    }

    function updateVictory() {
        victoryFrame++;
        if (victoryFrame == armSSCoords.length * 25) victoryFrame = 0;
        if (!isCoolingDown('pause-for-victory') && gameButtonState.inject > 0) {
            isDemoMode = true;
            isVictory = false;
            victoryFrame = 0;
        }
    }

    function didCollide(r1: Rectangle, r2: Rectangle): boolean {
        return r1.x < r2.x + r2.width &&
            r1.x + r1.width > r2.x &&
            r1.y < r2.y + r2.height &&
            r1.height + r1.y > r2.y;
    }

    function checkForCollisions() {

        let shipWidth = 0.75 * ship.width;
        let shipHeight = 0.75 * ship.height;

        let shipRect: Rectangle = {
            x: ship.x - (shipWidth / 2),
            y: ship.y - (shipHeight / 2),
            width: shipWidth,
            height: shipHeight
        };

        if (isMedicineVisible) {
            if (ship.x - (ship.width / 2) < medicineCoord.x + medicineImage.width &&
                ship.x - (ship.width / 2) + ship.width > medicineCoord.x &&
                ship.y - (ship.height / 2) < medicineCoord.y + medicineImage.height &&
                ship.height + ship.y - (ship.height / 2) > medicineCoord.y) {
                ship.juice = 100;
                isMedicineVisible = false;
                setCooldown('medicine', Math.floor(Math.random() * 1000));
                setCooldown('juice-flicker', 10);
            }
        }

        butts.forEach(butt => {

            let buttRect: Rectangle = {
                x: butt.x - (butt.width / 2),
                y: butt.y - (butt.height / 2),
                width: butt.width,
                height: butt.height
            };

            if (ship.juicing &&
                butt.x - (butt.width / 2) < ship.hitbox.x + ship.hitbox.width &&
                butt.x - (butt.width / 2) + butt.width > ship.hitbox.x &&
                butt.y - (butt.height / 2) < ship.hitbox.y + ship.hitbox.height &&
                butt.height + butt.y - (butt.height / 2) > ship.hitbox.y) {
                butt.isHit = true;
                roundScore++;
                ship.score++;

                // BOUNCE the ship away
                let opposite = ship.frame + 6;
                if (opposite > 11) opposite -= 11;
                ship.xVelocity = 1.5 * velocities[opposite].x;
                ship.yVelocity = 1.5 * velocities[opposite].y;

                setCooldown('bounce', 7);
            }

            bullets.filter(b => !b.isHit).forEach(bullet => {

                let bullRect: Rectangle = {
                    x: bullet.x - (bullet.width / 2),
                    y: bullet.y - (bullet.height / 2),
                    width: bullet.width,
                    height: bullet.height
                };

                if (didCollide(buttRect, bullRect)) {
                    // COLLISION
                    butt.isHit = true;
                    bullet.isHit = true;
                    // TODO: Spawn a pop or something.
                    roundScore++;
                    ship.score++;
                }
            });

            if (!isCoolingDown('butt-flicker')) {

                if (didCollide(buttRect, shipRect)) {
                    youLose();
                }
            }
        });

    }

    function youLose() {
        setCooldown('lose', 80);
        butts = [];
        bullets = [];
        ship.x = canvas.width / 2;
        ship.y = canvas.height / 2;
        ship.score = 0;
        round = 0;
        roundLoaded = false;
        ship.xVelocity = 0;
        ship.yVelocity = 0;
        ship.frame = 0;
        demoFrame = 0;
    }

    function draw(timestamp: number) {
        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (configuringGamepad !== '') {
            // context.fillStyle = 'yellow';
            // context.fillText('PRESS ' + gameButtonNameList[configuringGamepadButton].toUpperCase(), 10, 10);
            drawStringCentered(context, canvas.height / 2, 'PRESS ' + gameButtonNameList[configuringGamepadButton].toUpperCase());
        } else if (isDemoMode) {
            if (!roundLoaded) initializeRound();

            // draw the butts.
            butts.forEach((b, i) => {
                if (demoFrame % 2 == i % 2) {
                    context.drawImage(b.image, buttSSCoords[b.direction].x, buttSSCoords[b.direction].y, buttSSDimensions.width, buttSSDimensions.height, b.x - (b.width / 2), b.y - (b.height / 2), b.width, b.height);
                }
            });

            // context.fillStyle = 'yellow';
            // context.font = '60px Arial';
            // context.textAlign = 'center';
            // context.fillText('STEROIDS', canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
            drawStringCentered(context, canvas.height / 2 - 40, 'STEROIDS');
            // context.font = '20px Arial';
            // context.fillText('PRESS INJECT TO START!', canvas.width / 2, canvas.height / 2 + 20, canvas.width * 0.75);
            drawStringCentered(context, canvas.height / 2 + 20, 'press inject');
            drawStringCentered(context, canvas.height / 2 + 40, 'to start');
        } else if (isVictory) {
            context.drawImage(armSSImage, armSSCoords[Math.floor(victoryFrame / 25)].x, armSSCoords[Math.floor(victoryFrame / 25)].y, armSSDimensions.width, armSSDimensions.height, (canvas.width / 2) - (armSSDimensions.width * 2), (canvas.height / 2) - (armSSDimensions.height * 2), armSSDimensions.width * 4, armSSDimensions.height * 4);
            // context.fillStyle = 'yellow';
            // context.font = '40px Arial';
            // context.textAlign = 'center';
            // context.fillText('TOTALLY JUICED BRO!', canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
            drawStringCentered(context, canvas.height / 2, 'TOTALLY JUICED BRO!');

            if (!isCoolingDown('pause-for-victory')) {
                // context.font = '8px Arial';
                // context.fillText('PRESS INJECT TO PLAY AGAIN', canvas.width / 2, canvas.height / 2 + 20);
                drawStringCentered(context, canvas.height / 2, 'PRESS INJECT TO PLAY AGAIN');
            }
        } else {
            // Draw bullets first so they appear from under the ship.
            context.fillStyle = 'yellow';

            // No bullets.
            /*
            bullets.forEach(b => {
              context.fillRect(b.x - (b.width / 2), b.y - (b.height / 2), b.width, b.height);
            });
            */

            // draw medicine
            if (isMedicineVisible) {
                context.drawImage(medicineImage, medicineCoord.x, medicineCoord.y);
            }

            // draw the butts.
            butts.forEach((b, i) => {
                if (!isCoolingDown('butt-flicker') || (getCooldown('butt-flicker') % 2 == i % 2)) {
                    context.drawImage(b.image, buttSSCoords[b.direction].x, buttSSCoords[b.direction].y, buttSSDimensions.width, buttSSDimensions.height, Math.floor(b.x - (b.width / 2)), Math.floor(b.y - (b.height / 2)), b.width, b.height);
                }
            });

            // Draw the ship.
            if (!isCoolingDown('lose')) {
                context.drawImage(ship.image, ship.coords[ship.frame].x, ship.coords[ship.frame].y, ship.width, ship.height, Math.floor(ship.x - (ship.width / 2)), Math.floor(ship.y - (ship.height / 2)), ship.width, ship.height);
                // draw a rectangle around the tip of the ship maybe.
                if (ship.juicing) context.fillRect(Math.floor(ship.hitbox.x), Math.floor(ship.hitbox.y), ship.hitbox.width, ship.hitbox.height);
            }

            // Draw the round and score.
            context.fillStyle = 'white';
            context.font = 'bold 8px Arial';
            context.textAlign = 'left';
            context.fillText('' + (ship.score * 100), 5, 10);
            context.drawImage(armSSImage, armSSCoords[round].x, armSSCoords[round].y, armSSDimensions.width, armSSDimensions.height, 10, 10, armSSDimensions.width, armSSDimensions.height);

            // draw the juice box
            context.beginPath();
            context.lineWidth = 2;
            context.strokeStyle = 'yellow';
            context.rect(320 - 11 - 100, 9, 102, 12);
            context.stroke();

            // draw the juice
            context.fillStyle = 'green';
            if (getCooldown('juice-flicker') % 2 == 0) context.fillRect((100 - ship.juice) + 320 - 10 - 100, 10, ship.juice, 10);

            // Draw get ready message
            if (isCoolingDown('show-get-ready')) {
                // context.fillStyle = 'yellow';
                // context.font = '24px Arial';
                // context.textAlign = 'center';
                // context.fillText('GET READY TO JUICE!', canvas.width / 2, canvas.height / 2);
                drawStringCentered(context, canvas.height / 2, 'GET READY TO JUICE!');
            }

            if (isCoolingDown('lose')) {
                // context.fillStyle = 'red';
                // context.font = '24px Arial';
                // context.textAlign = 'center';
                // context.fillText('HEY LOOK', canvas.width / 2, canvas.height / 2);
                // context.fillText('THE LOSER LOST!', canvas.width / 2, canvas.height / 2 + 20);
                drawStringCentered(context, canvas.height / 2, 'HEY LOOK');
                drawStringCentered(context, (canvas.height / 2) + 20, 'THE LOSER LOST!');
            }

        }

        // Draw all the debugging info.
        if (DEBUG) {
            context.font = '8px Arial';
            context.textAlign = 'start';
            context.fillStyle = 'white';
            let y = 1;
            context.fillText('score (ship/round): ' + ship.score + '/' + roundScore, 5, y * 10);
            y++;
            context.fillText('round: ' + round, 5, y * 10);
            y++;
            context.fillText('direction: ' + ship.frame + ' - ' + (ship.frame * 30) + ' degrees', 5, y * 10);
            y++;
            context.fillText('velocity: ' + ship.xVelocity + ' x ' + ship.yVelocity + ' - Vector: ' + (Math.sqrt(Math.pow(ship.xVelocity, 2) + Math.pow(ship.yVelocity, 2))), 5, y * 10);
            y++;
            context.fillText('location: ' + ship.x + ' x ' + ship.y, 5, y * 10);
            y++;
            for (let key in gameButtonState) {
                context.fillText(key + ': ' + gameButtonState[key], 5, y * 10);
                y++;
            }
            for (let key in cooldowns) {
                context.fillText(key + ': ' + cooldowns[key], 5, y * 10);
                y++;
            }
        }
    }

    function loop(timestamp: number) {
        requestAnimationFrame(loop);

        updateCooldowns();
        updateInput();

        if (configuringGamepad !== '') updateGamepadConfig();
        else if (isVictory) updateVictory();
        else if (isDemoMode) updateDemo();
        else update(timestamp);

        draw(timestamp);
    }

    loop(0);
}

window.addEventListener('DOMContentLoaded', () => {
    let gameCanvas = document.querySelector<HTMLCanvasElement>('#game');
    if (gameCanvas) main(gameCanvas);
    else throw 'Canvas not found';
});
