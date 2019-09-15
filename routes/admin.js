const express = require("express");
const { getAllUsers } = require("../controllers/users");
const { getSubmissions } = require("../controllers/submissions");
const { addEpisode, getEpisodes } = require("../controllers/episode");
const { generateSegments } = require("../controllers/segment");
const upload = require("../controllers/multer");
const { uploadSegments } = require("../controllers/ftp");
const parser = require('subtitles-parser');
const fs = require("fs");
const router = express.Router();

/* GET users listing. */
router.get("/", async (req, res) => {
  if (!req.user) {
    res.redirect("/login");
  } else if (!req.user.admin) {
    res.redirect("/");
  } else {
    const [users, submissions, episodes] = await Promise.all([
      getAllUsers(),
      getSubmissions(),
      getEpisodes()
    ]);
    res.render("admin", { title: "Admin", submissions, users, episodes });
  }
});

/* POST audio and transcript */
router.post(
  "/",
  upload.fields([
    { name: "audioFile", maxCount: 1 },
    { name: "srtFile", maxCount: 1 }
  ]),
  async (req, res, next) => {
    if (!req.user) res.redirect('/login');
    else {
      const files = req.files;
      if (Object.entries(files).length === 0) {
        const error = new Error("Please upload a file");
        error.httpStatusCode = 400;
        return next(error);
      }
      // SRT file processing
      const [srtFile] = files.srtFile;
      let data = fs.readFileSync(srtFile.path,'utf8');
      data = data.replace(/(\d{2}:\d{2}:\d{2},\d{2})(\s)/g, '$10$2');
      const srt = parser.fromSrt(data, true);
      // Audio file processing
      const [audioFile] = files.audioFile;
      addEpisode(req).then(episode => {
        generateSegments(srt, episode, audioFile.path)
        .then(segmentList => {
          console.log("Updating episode with segments");
          episode.segment = segmentList;
          episode.save();
          uploadSegments(episode.number, segmentList.length)
          .then(() => {
            fs.unlinkSync(audioFile.path);
            fs.unlinkSync(srtFile.path);
          });
        });
      });
      
      res.redirect('/admin')
    }
  }
);

module.exports = router;
