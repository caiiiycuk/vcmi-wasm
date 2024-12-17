
  if (!Module['expectedDataFileDownloads']) {
    Module['expectedDataFileDownloads'] = 0;
  }

  Module['expectedDataFileDownloads']++;
  (() => {
    // Do not attempt to redownload the virtual filesystem data when in a pthread or a Wasm Worker context.
    var isPthread = typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD;
    var isWasmWorker = typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER;
    if (isPthread || isWasmWorker) return;
    function loadPackage(metadata) {

      var PACKAGE_PATH = '';
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
      } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
        // web worker
        PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
      }
      var PACKAGE_NAME = 'ru.data';
      var REMOTE_PACKAGE_BASE = 'ru.data';
      if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
        Module['locateFile'] = Module['locateFilePackage'];
        err('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
      }
      var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];

      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        
        Module['dataFileDownloads'] ??= {};
        fetch(packageName)
          .catch((cause) => Promise.reject(new Error(`Network Error: ${packageName}`, {cause}))) // If fetch fails, rewrite the error to include the failing URL & the cause.
          .then((response) => {
            if (!response.ok) {
              return Promise.reject(new Error(`${response.status}: ${response.url}`));
            }

            if (!response.body && response.arrayBuffer) { // If we're using the polyfill, readers won't be available...
              return response.arrayBuffer().then(callback);
            }

            const reader = response.body.getReader();
            const iterate = () => reader.read().then(handleChunk).catch((cause) => {
              return Promise.reject(new Error(`Unexpected error while handling : ${response.url} ${cause}`, {cause}));
            });

            const chunks = [];
            const headers = response.headers;
            const total = Number(headers.get('Content-Length') ?? packageSize);
            let loaded = 0;

            const handleChunk = ({done, value}) => {
              if (!done) {
                chunks.push(value);
                loaded += value.length;
                Module['dataFileDownloads'][packageName] = {loaded, total};

                let totalLoaded = 0;
                let totalSize = 0;

                for (const download of Object.values(Module['dataFileDownloads'])) {
                  totalLoaded += download.loaded;
                  totalSize += download.total;
                }

                Module['setStatus']?.(`Downloading data... (${totalLoaded}/${totalSize})`);
                return iterate();
              } else {
                const packageData = new Uint8Array(chunks.map((c) => c.length).reduce((a, b) => a + b, 0));
                let offset = 0;
                for (const chunk of chunks) {
                  packageData.set(chunk, offset);
                  offset += chunk.length;
                }
                callback(packageData.buffer);
              }
            };

            Module['setStatus']?.('Downloading data...');
            return iterate();
          });
      };

      function handleError(error) {
        console.error('package error:', error);
      };

      var fetchedCallback = null;
      var fetched = Module['getPreloadedPackage'] ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;

      if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, (data) => {
        if (fetchedCallback) {
          fetchedCallback(data);
          fetchedCallback = null;
        } else {
          fetched = data;
        }
      }, handleError);

    function runWithFS(Module) {

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }
Module['FS_createPath']("/", "Maps", true, true);

      /** @constructor */
      function DataRequest(start, end, audio) {
        this.start = start;
        this.end = end;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function(mode, name) {
          this.name = name;
          this.requests[name] = this;
          Module['addRunDependency'](`fp ${this.name}`);
        },
        send: function() {},
        onload: function() {
          var byteArray = this.byteArray.subarray(this.start, this.end);
          this.finish(byteArray);
        },
        finish: function(byteArray) {
          var that = this;
          // canOwn this data in the filesystem, it is a slide into the heap that will never change
          Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
          Module['removeRunDependency'](`fp ${that.name}`);
          this.requests[this.name] = null;
        }
      };

      var files = metadata['files'];
      for (var i = 0; i < files.length; ++i) {
        new DataRequest(files[i]['start'], files[i]['end'], files[i]['audio'] || 0).open('GET', files[i]['filename']);
      }

      function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer.constructor.name === ArrayBuffer.name, 'bad input to processPackageData');
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // Reuse the bytearray from the XHR as the source for file reads.
          DataRequest.prototype.byteArray = byteArray;
          var files = metadata['files'];
          for (var i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }          Module['removeRunDependency']('datafile_ru.data');

      };
      Module['addRunDependency']('datafile_ru.data');

      if (!Module['preloadResults']) Module['preloadResults'] = {};

      Module['preloadResults'][PACKAGE_NAME] = {fromCache: false};
      if (fetched) {
        processPackageData(fetched);
        fetched = null;
      } else {
        fetchedCallback = processPackageData;
      }

    }
    if (Module['calledRun']) {
      runWithFS(Module);
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

    }
    loadPackage({"files": [{"filename": "/Maps/A Viking We Shall Go Allied.h3m", "start": 0, "end": 47813}, {"filename": "/Maps/A Viking We Shall Go.h3m", "start": 47813, "end": 95625}, {"filename": "/Maps/A Warm and Familiar Place.h3m", "start": 95625, "end": 105207}, {"filename": "/Maps/Adventures of Jared Haret.h3m", "start": 105207, "end": 115674}, {"filename": "/Maps/All for One.h3m", "start": 115674, "end": 145377}, {"filename": "/Maps/And One for All.h3m", "start": 145377, "end": 158259}, {"filename": "/Maps/Arrogance Allied.h3m", "start": 158259, "end": 169997}, {"filename": "/Maps/Arrogance.h3m", "start": 169997, "end": 181735}, {"filename": "/Maps/Ascension.h3m", "start": 181735, "end": 197880}, {"filename": "/Maps/Back For Revenge - Allied.h3m", "start": 197880, "end": 256367}, {"filename": "/Maps/Back For Revenge.h3m", "start": 256367, "end": 314841}, {"filename": "/Maps/Barbarian Breakout.h3m", "start": 314841, "end": 325006}, {"filename": "/Maps/Barbarian BreakoutA.h3m", "start": 325006, "end": 335261}, {"filename": "/Maps/Battle of the Sexes Allied.h3m", "start": 335261, "end": 375798}, {"filename": "/Maps/Battle of the Sexes.h3m", "start": 375798, "end": 416295}, {"filename": "/Maps/Brave New World(Allies).h3m", "start": 416295, "end": 458548}, {"filename": "/Maps/Brave New World.h3m", "start": 458548, "end": 500648}, {"filename": "/Maps/Buried Treasure.h3m", "start": 500648, "end": 527216}, {"filename": "/Maps/Carpe Diem - Allied.h3m", "start": 527216, "end": 556458}, {"filename": "/Maps/Carpe Diem.h3m", "start": 556458, "end": 585688}, {"filename": "/Maps/Caught in the Middle.h3m", "start": 585688, "end": 612653}, {"filename": "/Maps/Chasing a Dream.h3m", "start": 612653, "end": 621825}, {"filename": "/Maps/Crimson and Clover.h3m", "start": 621825, "end": 644656}, {"filename": "/Maps/Crimson and CloverA.h3m", "start": 644656, "end": 667714}, {"filename": "/Maps/Darwin's Prize(Allies).h3m", "start": 667714, "end": 688421}, {"filename": "/Maps/Darwin's Prize.h3m", "start": 688421, "end": 705217}, {"filename": "/Maps/Dawn of War.h3m", "start": 705217, "end": 723578}, {"filename": "/Maps/Dead and Buried.h3m", "start": 723578, "end": 733463}, {"filename": "/Maps/Deluge.h3m", "start": 733463, "end": 741798}, {"filename": "/Maps/Divided Loyalties.h3m", "start": 741798, "end": 775126}, {"filename": "/Maps/Divided LoyaltiesA.h3m", "start": 775126, "end": 808530}, {"filename": "/Maps/Dragon Orb.h3m", "start": 808530, "end": 836830}, {"filename": "/Maps/Dragon Pass (Allies).h3m", "start": 836830, "end": 864511}, {"filename": "/Maps/Dragon Pass.h3m", "start": 864511, "end": 892159}, {"filename": "/Maps/Dungeon Keeper.h3m", "start": 892159, "end": 904189}, {"filename": "/Maps/Dwarven Gold.h3m", "start": 904189, "end": 915758}, {"filename": "/Maps/Dwarven Tunnels(Allies).h3m", "start": 915758, "end": 943439}, {"filename": "/Maps/Dwarven Tunnels.h3m", "start": 943439, "end": 971102}, {"filename": "/Maps/Elbow Room(Allies).h3m", "start": 971102, "end": 976170}, {"filename": "/Maps/Elbow Room.h3m", "start": 976170, "end": 981231}, {"filename": "/Maps/Emerald Isles.h3m", "start": 981231, "end": 996224}, {"filename": "/Maps/Emerald IslesA.h3m", "start": 996224, "end": 1011110}, {"filename": "/Maps/Faeries.h3m", "start": 1011110, "end": 1044415}, {"filename": "/Maps/For Sale.h3m", "start": 1044415, "end": 1053082}, {"filename": "/Maps/Fort Noxis.h3m", "start": 1053082, "end": 1064934}, {"filename": "/Maps/Free for All.h3m", "start": 1064934, "end": 1110531}, {"filename": "/Maps/Freedom.h3m", "start": 1110531, "end": 1119598}, {"filename": "/Maps/Gelea's Champions (Allies).h3m", "start": 1119598, "end": 1154638}, {"filename": "/Maps/Gelea's Champions.h3m", "start": 1154638, "end": 1190077}, {"filename": "/Maps/Goblins in the Pantry.h3m", "start": 1190077, "end": 1209381}, {"filename": "/Maps/Golems Aplenty Allied.h3m", "start": 1209381, "end": 1235590}, {"filename": "/Maps/Golems Aplenty.h3m", "start": 1235590, "end": 1261790}, {"filename": "/Maps/Good Witch, Bad Witch.h3m", "start": 1261790, "end": 1297079}, {"filename": "/Maps/Good to Go.h3m", "start": 1297079, "end": 1302110}, {"filename": "/Maps/Gorlam's Tentacle Swampland.h3m", "start": 1302110, "end": 1323035}, {"filename": "/Maps/Hatchet Axe and Saw.h3m", "start": 1323035, "end": 1340240}, {"filename": "/Maps/Heroes of Might not Magic Allied.h3m", "start": 1340240, "end": 1372842}, {"filename": "/Maps/Heroes of Might not Magic.h3m", "start": 1372842, "end": 1405441}, {"filename": "/Maps/Hoard(Allies).h3m", "start": 1405441, "end": 1439173}, {"filename": "/Maps/Hoard.h3m", "start": 1439173, "end": 1472958}, {"filename": "/Maps/Hold the middle.h3m", "start": 1472958, "end": 1497939}, {"filename": "/Maps/Irrational Hostility.h3m", "start": 1497939, "end": 1506886}, {"filename": "/Maps/Island King Allied.h3m", "start": 1506886, "end": 1542657}, {"filename": "/Maps/Island King.h3m", "start": 1542657, "end": 1578412}, {"filename": "/Maps/Island of Fire.h3m", "start": 1578412, "end": 1603133}, {"filename": "/Maps/Islands and Caves.h3m", "start": 1603133, "end": 1642569}, {"filename": "/Maps/Jihad.h3m", "start": 1642569, "end": 1651380}, {"filename": "/Maps/Judgement Day.h3m", "start": 1651380, "end": 1656558}, {"filename": "/Maps/Just A Visit.h3m", "start": 1656558, "end": 1675410}, {"filename": "/Maps/Key to Victory.h3m", "start": 1675410, "end": 1683807}, {"filename": "/Maps/King of Pain.h3m", "start": 1683807, "end": 1705393}, {"filename": "/Maps/Kingdom for sale(allies).h3m", "start": 1705393, "end": 1743511}, {"filename": "/Maps/Kingdom for sale.h3m", "start": 1743511, "end": 1781620}, {"filename": "/Maps/Knee Deep in the Dead.h3m", "start": 1781620, "end": 1788735}, {"filename": "/Maps/Knight of Darkness.h3m", "start": 1788735, "end": 1816773}, {"filename": "/Maps/Land of Titans.h3m", "start": 1816773, "end": 1866126}, {"filename": "/Maps/Last Chance Allies.h3m", "start": 1866126, "end": 1876408}, {"filename": "/Maps/Last Chance.h3m", "start": 1876408, "end": 1886682}, {"filename": "/Maps/Loss of Innocence(Allies).h3m", "start": 1886682, "end": 1917187}, {"filename": "/Maps/Loss of Innocence.h3m", "start": 1917187, "end": 1947588}, {"filename": "/Maps/Manifest Destiny.h3m", "start": 1947588, "end": 1957551}, {"filename": "/Maps/Marshland Menace.h3m", "start": 1957551, "end": 1983463}, {"filename": "/Maps/Meeting in Muzgob(Allies).h3m", "start": 1983463, "end": 2016386}, {"filename": "/Maps/Meeting in Muzgob.h3m", "start": 2016386, "end": 2049315}, {"filename": "/Maps/Merchant Princes Allied.h3m", "start": 2049315, "end": 2065867}, {"filename": "/Maps/Merchant Princes.h3m", "start": 2065867, "end": 2082413}, {"filename": "/Maps/Middletown.h3m", "start": 2082413, "end": 2124180}, {"filename": "/Maps/Monk's Retreat Allied.h3m", "start": 2124180, "end": 2175119}, {"filename": "/Maps/Monk's Retreat.h3m", "start": 2175119, "end": 2226055}, {"filename": "/Maps/Noahs Ark.h3m", "start": 2226055, "end": 2265359}, {"filename": "/Maps/One Bad Day - Allied.h3m", "start": 2265359, "end": 2286320}, {"filename": "/Maps/Overthrow Thy Neighbors.h3m", "start": 2286320, "end": 2314239}, {"filename": "/Maps/Pandora's Box .h3m", "start": 2314239, "end": 2438087}, {"filename": "/Maps/Peaceful Ending - Allied.h3m", "start": 2438087, "end": 2481958}, {"filename": "/Maps/Peaceful Ending.h3m", "start": 2481958, "end": 2525872}, {"filename": "/Maps/Peacemaker.h3m", "start": 2525872, "end": 2541480}, {"filename": "/Maps/Pestilence Lake Allies.h3m", "start": 2541480, "end": 2572698}, {"filename": "/Maps/Pestilence Lake.h3m", "start": 2572698, "end": 2603946}, {"filename": "/Maps/Pirates.h3m", "start": 2603946, "end": 2617995}, {"filename": "/Maps/Race for Ardintinny.h3m", "start": 2617995, "end": 2684076}, {"filename": "/Maps/Race for the Town.h3m", "start": 2684076, "end": 2701977}, {"filename": "/Maps/Ready or Not.h3m", "start": 2701977, "end": 2726500}, {"filename": "/Maps/Realm of Chaos.h3m", "start": 2726500, "end": 2762124}, {"filename": "/Maps/Realm of ChaosA.h3m", "start": 2762124, "end": 2797702}, {"filename": "/Maps/Rebellion.h3m", "start": 2797702, "end": 2815948}, {"filename": "/Maps/Reclamation Allied.h3m", "start": 2815948, "end": 2869642}, {"filename": "/Maps/Reclamation.h3m", "start": 2869642, "end": 2923322}, {"filename": "/Maps/Rediscovery.h3m", "start": 2923322, "end": 2957830}, {"filename": "/Maps/Resource War Allies.h3m", "start": 2957830, "end": 2979963}, {"filename": "/Maps/Resource War.h3m", "start": 2979963, "end": 3002095}, {"filename": "/Maps/Rise of the Phoenix Allied.h3m", "start": 3002095, "end": 3050478}, {"filename": "/Maps/Rise of the Phoenix.h3m", "start": 3050478, "end": 3098855}, {"filename": "/Maps/Rumble in the Bogs.h3m", "start": 3098855, "end": 3121222}, {"filename": "/Maps/Rumble in the BogsA.h3m", "start": 3121222, "end": 3143602}, {"filename": "/Maps/Sands of Blood.h3m", "start": 3143602, "end": 3151475}, {"filename": "/Maps/Sangraal's Thief Allied.h3m", "start": 3151475, "end": 3182244}, {"filename": "/Maps/Sangraal's Thief.h3m", "start": 3182244, "end": 3212999}, {"filename": "/Maps/Search for the Grail.h3m", "start": 3212999, "end": 3233938}, {"filename": "/Maps/Serpents Treasure.h3m", "start": 3233938, "end": 3296089}, {"filename": "/Maps/Shadow Valleys.h3m", "start": 3296089, "end": 3318234}, {"filename": "/Maps/South of Hell (Allies).h3m", "start": 3318234, "end": 3360408}, {"filename": "/Maps/South of Hell.h3m", "start": 3360408, "end": 3402568}, {"filename": "/Maps/Southern Cross.h3m", "start": 3402568, "end": 3441963}, {"filename": "/Maps/Step by Step (Allies).h3m", "start": 3441963, "end": 3469456}, {"filename": "/Maps/Step by Step.h3m", "start": 3469456, "end": 3496944}, {"filename": "/Maps/Tale of two lands (Allies).h3m", "start": 3496944, "end": 3570376}, {"filename": "/Maps/Tale of two lands.h3m", "start": 3570376, "end": 3643780}, {"filename": "/Maps/Terrible Rumor.h3m", "start": 3643780, "end": 3655137}, {"filename": "/Maps/The Battle of Daeyan's Ford.h3m", "start": 3655137, "end": 3705727}, {"filename": "/Maps/The Challenge.h3m", "start": 3705727, "end": 3726599}, {"filename": "/Maps/The Five Rings.h3m", "start": 3726599, "end": 3777111}, {"filename": "/Maps/The Gauntlet.h3m", "start": 3777111, "end": 3826453}, {"filename": "/Maps/The Great Race.h3m", "start": 3826453, "end": 3848103}, {"filename": "/Maps/The Mandate of Heaven.h3m", "start": 3848103, "end": 3918962}, {"filename": "/Maps/The Newcomers.h3m", "start": 3918962, "end": 3935217}, {"filename": "/Maps/Thousand Islands (allies).h3m", "start": 3935217, "end": 3986184}, {"filename": "/Maps/Thousand Islands.h3m", "start": 3986184, "end": 4037139}, {"filename": "/Maps/Time's Up.h3m", "start": 4037139, "end": 4048250}, {"filename": "/Maps/Titans Winter.h3m", "start": 4048250, "end": 4078721}, {"filename": "/Maps/Too Many Monsters.h3m", "start": 4078721, "end": 4086351}, {"filename": "/Maps/Tovar's Fortress (Allies).h3m", "start": 4086351, "end": 4116109}, {"filename": "/Maps/Tovar's Fortress.h3m", "start": 4116109, "end": 4145859}, {"filename": "/Maps/Treasure Hunt.h3m", "start": 4145859, "end": 4165861}, {"filename": "/Maps/Tutorial.tut", "start": 4165861, "end": 4172228}, {"filename": "/Maps/Twins.h3m", "start": 4172228, "end": 4184807}, {"filename": "/Maps/Undead Unrest.h3m", "start": 4184807, "end": 4212104}, {"filename": "/Maps/Unexpected Inheritance.h3m", "start": 4212104, "end": 4243199}, {"filename": "/Maps/Unholy Quest.h3m", "start": 4243199, "end": 4297708}, {"filename": "/Maps/Valleys of War.h3m", "start": 4297708, "end": 4330103}, {"filename": "/Maps/Vial of Life.h3m", "start": 4330103, "end": 4360601}, {"filename": "/Maps/War of the Mighty (Allies).h3m", "start": 4360601, "end": 4436523}, {"filename": "/Maps/War of the Mighty.h3m", "start": 4436523, "end": 4512470}, {"filename": "/Maps/Warlords.h3m", "start": 4512470, "end": 4538334}, {"filename": "/Maps/WarlordsA.h3m", "start": 4538334, "end": 4564386}, {"filename": "/Maps/Warmongers.h3m", "start": 4564386, "end": 4614044}, {"filename": "/Maps/When Dragons Clash.h3m", "start": 4614044, "end": 4639403}, {"filename": "/Maps/Wings of War.h3m", "start": 4639403, "end": 4653646}, {"filename": "/Maps/Xathras Prize.h3m", "start": 4653646, "end": 4699486}], "remote_package_size": 4699486});

  })();
