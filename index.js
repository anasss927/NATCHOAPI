require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ متصل بقاعدة البيانات'))
  .catch(err => console.log('❌ خطأ:', err));

// نموذج الكي
const KeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  scriptId: { type: String, required: true },
  hwid: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const Key = mongoose.model('Key', KeySchema);

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.send('✅ API خدام مزيان');
});

// اللودر (ستايل Luarmor)
app.get('/loader/:id', async (req, res) => {
  const key = req.query.key;
  const scriptId = req.params.id;

  if (!key) {
    return res.status(400).send('-- محتاج كي');
  }

  try {
    const found = await Key.findOne({ key: key, scriptId: scriptId });

    if (!found) {
      return res.status(403).send('-- كي غلط');
    }

    // هنا غادي يرجع السكريبت
    res.type('text/plain').send(`
print("✅ تم التحقق من الكي بنجاح")
print("السكريبت ديالك غادي يبدا هنا")
    `);
  } catch (err) {
    res.status(500).send('-- خطأ في السيرفر');
  }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API خدام على البورت ${PORT}`);
});
