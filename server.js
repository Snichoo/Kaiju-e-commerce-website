// importing packages
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const nodemailer = require('nodemailer');

// firebase admin setup
let serviceAccount = require("./kaiju-v1-firebase-adminsdk-4saa5-0d8602d24f.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

let db = admin.firestore();

// aws config
const aws = require('aws-sdk');
const dotenv = require('dotenv');

dotenv.config();

// aws parameters
const region = "ap-southeast-2";
const bucketName = "kaiju-v1";
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;

aws.config.update({
    region, 
    accessKeyId, 
    secretAccessKey
})

// init s3
const s3 = new aws.S3();

// generate image upload link
async function generateUrl(){
    let date = new Date();
    let id = parseInt(Math.random() * 10000000000);

    const imageName = `${id}${date.getTime()}.jpg`;

    const params = ({
        Bucket: bucketName,
        Key: imageName,
        Expires: 300, //300 ms
        ContentType: 'image/jpeg'
    })
    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
    return uploadUrl;
}

// declare static path
let staticPath = path.join(__dirname, "public");

//intializing express.js
const app = express();

//middlewares
app.use(express.static(staticPath));
app.use(express.json());

//routes
//home route
app.get("/", (req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
})

//signup route
app.get('/signup', (req, res) => {
    res.sendFile(path.join(staticPath, "signup.html"));
})



// login route
app.get('/login', (req, res) => {
    res.sendFile(path.join(staticPath, "login.html"));
})



// seller route
app.get('/seller', (req, res) => {
    res.sendFile(path.join(staticPath, "seller.html"));
})

app.post('/seller', (req, res) => {
    let { name, about, address, number, tac, legit, email } = req.body;
    if(!name.length || !address.length || !about.length || number.length < 10 || !Number(number)){
        return res.json({'alert':'some inforamation(s) is/are invalid'});
    } else if(!tac || !legit){
        return res.json({'alert': 'you must agree to our terms and conditions'})
    } else{
        // update users seller status here.
        db.collection('sellers').doc(email).set(req.body)
        .then(data => {
            db.collection('users').doc(email).update({
                seller: true
            }).then(data => {
                res.json(true);
            })
        })
    }
})

// add product
app.get('/add-product', (req, res) => {
    res.sendFile(path.join(staticPath, "addProduct.html"));
})

app.get('/add-product/:id', (req, res) => {
    res.sendFile(path.join(staticPath, "addProduct.html"));
})

// get the upload link
app.get('/s3url', (req, res) => {
    generateUrl().then(url => res.json(url));
})

// add product
app.post('/add-product', (req, res) => {
    let { name, shortDes, des, images, sizes, actualPrice, discount, sellPrice, stock, tags, tac, email, draft, id } = req.body;

    // validation
    if(!draft){
        if(!name.length){
            return res.json({'alert': 'enter product name'});
        } else if(shortDes.length > 100 || shortDes.length < 10){
            return res.json({'alert': 'short description must be between 10 to 100 letters long'});
        } else if(!des.length){
            return res.json({'alert': 'enter detail description about the product'});
        } else if(!images.length){ // image link array
            return res.json({'alert': 'upload atleast one product image'})
        } else if(!sizes.length){ // size array
            return res.json({'alert': 'select at least one size'});
        } else if(!actualPrice.length || !discount.length || !sellPrice.length){
            return res.json({'alert': 'you must add pricings'});
        } else if(stock < 20){
            return res.json({'alert': 'you should have at least 20 items in stock'});
        } else if(!tags.length){
            return res.json({'alert': 'enter few tags to help ranking your product in search'});
        } else if(!tac){
            return res.json({'alert': 'you must agree to our terms and conditions'});
        } 
    }

    // add product
    let docName = id == undefined ? `${name.toLowerCase()}-${Math.floor(Math.random() * 5000)}` : id;
    db.collection('products').doc(docName).set(req.body)
    .then(data => {
        res.json({'product': name});
    })
    .catch(err => {
        return res.json({'alert': 'some error occured. Try again'});
    })
})

// get products
app.post('/get-products', (req, res) => {
    let { email, id, tag } = req.body;

    if(id){
        docRef = db.collection('products').doc(id)
    } else if(tag){
        // Get all products without filtering
        docRef = db.collection('products')
    } else{
        docRef = db.collection('products').where('email', '==', email)
    }

    docRef.get()
    .then(products => {
        if(products.empty){
            return res.json('no products');
        }
        let productArr = [];
        if(id){
            return res.json(products.data());
        } else{
            products.forEach(item => {
                let data = item.data();
                data.id = item.id;

                // Check if any of the tags contain the search key (case-insensitive)
                if(data.tags.some(productTag => productTag.toLowerCase().includes(tag))){
                    productArr.push(data);
                }
            })
            res.json(productArr)
        }
    })
})


app.post('/delete-product', (req, res) => {
    let { id } = req.body;
    
    db.collection('products').doc(id).delete()
    .then(data => {
        res.json('success');
    }).catch(err => {
        res.json('err');
    })
})

// product page
app.get('/products/:id', (req, res) => {
    res.sendFile(path.join(staticPath, "product.html"));
})

app.get('/search/:key', (req, res) => {
    res.sendFile(path.join(staticPath, "search.html"));
})

app.get('/cart', (req, res) => {
    res.sendFile(path.join(staticPath, "cart.html"));
})

app.get('/checkout', (req, res) => {
    res.sendFile(path.join(staticPath, "checkout.html"));
})

app.post('/order', (req, res) => {
    const { order, email, add } = req.body;

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD
        }
    })

    const mailOption = {
        from: 'masaruhirata4@gmail.com',
        to: email,
        subject: 'Clothing : Order Placed',
        html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>

            <style>
                body{
                    min-height: 90vh;
                    background: #f5f5f5;
                    font-family: sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .heading{
                    text-align: center;
                    font-size: 40px;
                    width: 50%;
                    display: block;
                    line-height: 50px;
                    margin: 30px auto 60px;
                    text-transform: capitalize;
                }
                .heading span{
                    font-weight: 300;
                }
                .btn{
                    width: 200px;
                    height: 50px;
                    border-radius: 5px;
                    background: #3f3f3f;
                    color: #fff;
                    display: block;
                    margin: auto;
                    font-size: 18px;
                    text-transform: capitalize;
                }
            </style>

        </head>
        <body>
            
            <div>
                <h1 class="heading">dear ${email.split('@')[0]}, <span>your order is successfully placed</span></h1>
                <button class="btn">check status</button>
            </div>

        </body>
        </html>
        `
    }

    let docName = email + Math.floor(Math.random() * 123719287419824);
    db.collection('order').doc(docName).set(req.body)
    .then(data => {

        transporter.sendMail(mailOption, (err, info) => {
            if(err){
                res.json({'alert': 'opps! its seems like some err occured. Try again'})
            } else{
                res.json({'alert': 'your order is placed', 'type': 'success'});
            }
        })

    })
})

// 404 route
app.get('/404', (req, res) => {
    res.sendFile(path.join(staticPath, "404.html"));
})

app.use((req, res) => {
    res.redirect('/404');
})

app.listen(process.env.PORT || 3000, () => {
    console.log('listening on port 3000.......');
 })
 

