'use strict';

const SUMATRA_PDF_EXE = "C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe";

const express = require('express')
,	multer  = require('multer')
,	upload = multer({ dest: 'uploads/' })
,	spawn = require('child_process').spawn
,	EventEmitter = require('events')
,	util = require('util')
;

var app = express()
,	expressWs = require('express-ws')(app)
,	activeJobs = {}
;

app.use(require('express-request-id')());

app.ws('/jobs/:job_id/live', (ws, req) => {
	var j = activeJobs[req.params.job_id];

	j.lines.forEach(line => {
		ws.send(line);
	});

	if(j.exitCode != -1) {
		ws.send(j.exitCode);
	}
	else {
		j.on('line', (line) => {
			ws.send(line)
			ws.close();
		});

		j.on('exit', (code) => {
			ws.close(code + 4000);
		})
	}
});

app.post('/print', upload.single('pdf'), (req, res, next) => {
	var copies = req.body.copies || 1
	,	paths = [req.file].map((file) => {
		return file.path;
	})
	;

	res.send({job_id: req.id});

	activeJobs[req.id] = new PrintPDFsJob(req.id, paths, copies);
});

function PrintPDFsJob(id, paths, copies, cb) {
	this.args = [
		"-print-to-default",
		"-print-settings",
		copies + "x"
	];

	this.lines = [];
	this.exitCode = -1;

	var addLine = (line) => {
		this.lines.push(line);
		this.emit('line', line);
	}

	paths.forEach((path) => {
		this.args.push(path);
	});


	try {
		var pdf = spawn(SUMATRA_PDF_EXE, this.args);

		pdf.stdout.on('data', (data) => {
			addLine('[stdout] ' + data.toString());
		});

		pdf.stderr.on('data', (data) => {
			addLine('[stderr] ' + data.toString());
		});

		pdf.on('close', (code) => {
			this.exitCode = code;
			this.emit('exit', code);

			// destroy self after 60 seconds of being done
			setTimeout(() => {
				activeJobs[id] = null;
			}, 60 * 1000);
		});		
	}
	catch (e) {
		console.log(e);
	}

	EventEmitter.call(this);

	return this;
}

util.inherits(PrintPDFsJob, EventEmitter);

app.use(express.static('public'));

app.listen(9517, () => {
	console.log("Listening on port 9517");
});
