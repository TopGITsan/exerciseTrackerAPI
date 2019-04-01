const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const shortid = require('shortid');
const moment = require('moment')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'this is the connection error: '));
db.once('open', () => { console.log('connected to the mongoDB Atlas...') });

app.use(cors())

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const Schema = mongoose.Schema;
const userSchema = new Schema({
  shortID: { type: String, default: shortid.generate, unique: true },
  username: { type: String, required: true, unique: true },
  exercises: [{ description: { type: String, required: true }, duration: { type: Number, required: true }, date: { type: Date, default: Date.now }, done: { type: Boolean, default: false } }],
  userIP: String,
  userLanguage: String,
  userSoftware: String,
  createdAt: { type: Date, default: Date.now }
});
const userModel = db.model('users', userSchema);


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/api/exercise/users', (req, res) => {

  userModel.find({}, 'username shortID', (err, data) => {
    if (err) return err;
    // console.log(data.map(obj=>{return {"username":obj.username, "ID": obj.shortID }}));
    const showData = data.map(obj => { return { "username": obj.username, "ID": obj.shortID } });
    res.send(showData);
  });


});

app.get('/api/exercise/log', (req, res) => {

  let { userId } = req.query;


  if (shortid.isValid(userId) && userId.length < 12) {
    let { from, to, limit } = req.query

    // console.log(req.query,shortid.isValid(userId), userId,from,to,limit);
    userModel.findOne({ "shortID": userId, }).exec((err, data) => {
      if (err) return err;
      if (!data) {
        console.log('Missing data ...')
      }

      const dataToShow = { id: data.shortID, username: data.username, exercise: data.exercises }

      if (from && moment(from).isValid()) {
        from = new Date(from);
        dataToShow.from = from.toDateString()
      };
      if (to && moment(to).isValid()) {
        to = new Date(to);
        dataToShow.to = to.toDateString();
      };

      // console.log(userId,from,to,limit);
      dataToShow.exercise = data.exercises.filter(obj => {
        if (from && to) {
          return obj.date >= from && obj.date <= to;
        } else if (from) {
          return obj.date >= from;
        } else if (to) {
          return obj.date <= to;
        } else {
          return true;
        }
      });
      if (limit) {
        let integer = Number.parseInt(limit, 10)
        if (!Number.isNaN(integer)) {
          dataToShow.count = integer
          dataToShow.exercise = dataToShow.exercise.slice(0, integer);
        }
      };

      // console.log(JSON.stringify(dataToShow, null, '\t'));
      res.send(dataToShow);
    });

  } else {
    res.json({ message: "Not a valid Id..." })
  }
});

app.post('/api/exercise/new-user', (req, res, next) => {
  let newUser = req.body.username;
  newUser = newUser.trim();
  const regex = /\s/gi;
  newUser = newUser.replace(regex, '');


  let ips = req.headers['x-forwarded-for'];
  let routerIp = ips.split(',')[0];
  let lang = req.headers['accept-language'];
  let soft = req.headers['user-agent'];

  if (newUser.length > 31) {
    res.send({ message: "Username length exceeds maximum limit" })
  } else {
    userModel.find({ "username": newUser }, (err, data) => {
      if (err) return next(err);

      if (!data.length) {
        const newUserModel = new userModel({
          username: newUser,
          userIP: routerIp,
          userLanguage: lang,
          userSoftware: soft
        });

        newUserModel.save((err, data) => {
          if (err) return next(err);
          if (!data) {
            console.log("Data missing. Check code ...");
            return next({ message: "Data missing!" })
          }
          // console.log(data.username, data.shortID)
          res.send({ "username": data.username, "user ID": data.shortID })

        });

      } else {
        res.send({ message: "Username already exists. Please try again ..." });
      }
    });
  }
});

app.post('/api/exercise/add', (req, res, next) => {
  const userId = req.body.userId,
    description = req.body.description,
    duration = req.body.duration,
    date = req.body.date;
  const requiredFields = userId && description && duration;   // check 
  // console.log(date);
  if (userId.length < 12 && shortid.isValid(userId) && requiredFields) {

    userModel.findOne({ "shortID": userId }, (err, data) => {
      if (err) return next(err);

      const newExercise = (!date) ? {
        "description": description,
        "duration": duration,
      } : {
          "description": description,
          "duration": duration,
          "date": date
        };

      data['exercises'].push(newExercise);

      data.save((err, data) => {
        if (err) return err;
        res.send({ "username": data.username, "exercises": data.exercises })
      });

    });
  } else {
    res.send({ "message": "Please insert a valid ID ..." })
  }

});

// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: 'not found' })
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
