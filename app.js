var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var multer = require('multer');
var fs = require('fs');
var cors = require('cors');
const csv = require('csvtojson');
var zip = require('express-zip');
const path = require('path');

var JsBarcode = require('jsbarcode');
var Canvas = require("canvas");
var canvas = new Canvas.Canvas();

app.use(cors());
app.use(bodyParser.json());

//multers disk storage settings
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './')
    },
    filename: function (req, file, cb) {
        var datetimestamp = Date.now();
        cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length - 1])
    }
});

//multer settings
var upload = multer({
    storage: storage,
    fileFilter: function (req, file, callback) {
        //file filter
        if (['csv'].indexOf(file.originalname.split('.')[file.originalname.split('.').length - 1]) === -1) {
            return callback(new Error('Wrong extension type'));
        }
        callback(null, true);
    }
}).single('file');

var barcodeJson = []; // from csv file
var barcodeFiles = []; // generate barcode as png file

/** API path that will upload the files */
app.post('/upload', function (req, res) {
    console.log('csv file upload requesting...')
    barcodeJson = [];
    var tempBarcodeJson = [];
    
    upload(req, res, function (err) {
        if (err) {
            res.json({ error_code: 1, err_desc: err });
            return;
        }

        let csvDataBuffer = JSON.stringify(req.body);
        let csvData = JSON.parse(csvDataBuffer).data;
        let csvDataString = csvData.toString("utf8");

        return csv()
            .fromString(csvDataString)
            .then(json => {
                let filteredJSON = [];
                // filter existing barcode
                if (barcodeFiles.length) {
                    json.forEach(element => {
                        let fileName = element['type;value'].split(';') + '.png';
                        let flag = true;

                        console.log('filename>>>', fileName);

                        barcodeFiles.every(barcode => {
                            if (barcode.name === fileName) {
                                flag = false;
                                return false;
                            }
                        });

                        if (flag) {
                            filteredJSON.push(element)
                        }
                    });

                    tempBarcodeJson = filteredJSON;
                } else {
                    tempBarcodeJson = json;
                }

                // remove duplicate barcode
                var valueArr = tempBarcodeJson.map(function (item) { return item['type;value'] });
                valueArr.some(function (item, idx) {
                    if (valueArr.indexOf(item) == idx) {
                        barcodeJson.push(tempBarcodeJson[idx]);
                    }
                });

                console.log('barcodeJson>>>', barcodeJson)
                return res.json({ error_code: 0, err_desc: null, message: "Uploaded successfully" });
            })
    });

});

app.get('/generate', function (req, res) {
    console.log('generating barcode is started...')

    if (!barcodeJson.length) {
        res.json({ error_code: 1, err_desc: "Please upload csv file" });
        return;
    }

    if (barcodeFiles.length) {
        console.log('Deleting barcode images started...');
        barcodeFiles.forEach(element => {
            fs.unlink(element.path, function (err) {
                if (err) return console.log('no such file or directory...', err);
                console.log('File deleted..');
            })
            // fs.unlinkSync(element.path); // Deleting the barcode png
        });
        console.log('Deleting barcode images finished...');

        barcodeFiles = [];
    }

    barcodeJson.forEach((element, index) => {
        console.log(index, ' element>>>', element)
        let value = element['type;value'].split(';');
        let type = value[0];
        let data = value[1];

        // Using JSBarcode npm package
        if(!checkEan(data)){
			type = 'code128';
		}
		
		JsBarcode(canvas, data, {
			format: type,
			displayValue: true
		});

        const buffer = canvas.toBuffer('image/png');

        var filePath = `./barcodes/${data}.png`;
        fs.writeFileSync(filePath, buffer);
        barcodeFiles.push({ path: filePath, name: `${data}.png` });

    });

    console.log('generating barcode is finished...')
    res.json({ error_code: 0, err_desc: null, message: "Barcode is generated successfully" });
});

app.get('/download', function (req, res) {
    console.log('download api is working...');
    if (!barcodeFiles.length) {
        console.log('there is no data to download');
        res.json({ error_code: 1, err_desc: "there is no data to download" });
        return;
    }

    console.log('barcodeFiles>>>', barcodeFiles);

    res.zip(barcodeFiles)

    console.log('download api is finished');
});

app.get('/test', function (req, res) {
    console.log('test api is working');
    res.json({ error_code: 0, err_desc: null, message: "test api is working fine" });
});

app.get('/key/:keyid/type/:typeid/value/:valueid', function (req, res) {
    if (req.params.keyid == 'deuyfjdhfd3') {
        var typeid = req.params.typeid;
        var valueid = req.params.valueid;
        
        if (typeid == 'ean13' || typeid == 'code128') {
        
            let type = typeid;
            let data = valueid;
            
            // Using JSBarcode npm package
            if(!checkEan(data)){
                type = 'code128';
            }
            
            JsBarcode(canvas, data, {
                format: type,
                displayValue: true
            });
            
            const buffer = canvas.toBuffer('image/png');
            
            var filePath = `./barcodes/${data}.png`;
            fs.writeFileSync(filePath, buffer);
            
            console.log('generating barcode is finished...');
            res.download(filePath);
            console.log('barcode image downloaded...');
        }
    }
});

function checkEan(eanCode) {
    // Check if only digits
    var ValidChars = "0123456789";
    for (i = 0; i < eanCode.length; i++) {
        digit = eanCode.charAt(i);
        if (ValidChars.indexOf(digit) == -1) {
            return false;
        }
    }
    
    if (eanCode.length != 13) {
        return false;
    }
    // Get the check number
    originalCheck = eanCode.substring(eanCode.length - 1);
    eanCode = eanCode.substring(0, eanCode.length - 1);
    // Add even numbers together
    even = Number(eanCode.charAt(1)) + Number(eanCode.charAt(3)) + Number(eanCode.charAt(5)) + Number(eanCode.charAt(7)) + Number(eanCode.charAt(9)) + Number(eanCode.charAt(11));
    // Multiply this result by 3
    even *= 3;
    // Add odd numbers together
    odd = Number(eanCode.charAt(0)) + Number(eanCode.charAt(2)) + Number(eanCode.charAt(4)) + Number(eanCode.charAt(6)) + Number(eanCode.charAt(8)) + Number(eanCode.charAt(10));
    // Add two totals together
    total = even + odd;
    // Calculate the checksum
    // Divide total by 10 and store the remainder
    checksum = total % 10;
    // If result is not 0 then take away 10
    if (checksum != 0) {
        checksum = 10 - checksum;
    }
    // Return the result
    if (checksum != originalCheck) {
        return false;
    }

    return true;
}

app.use(express.static(__dirname + '/dist/client'));

app.listen('8080', function () {
    console.log('running on 8080...');
});