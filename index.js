require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme123';

// ======================
// الاتصال بقاعدة البيانات
// ======================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ متصل بقاعدة البيانات'))
  .catch(err => console.log('❌ خطأ في قاعدة البيانات:', err));

// ======================
// النماذج (Models)
// ======================
const KeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  scriptId: { type: String, required: true, default: 'main' },
  hwid: { type: String, default: null },
  blacklisted: { type: Boolean, default: false },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: null }
});
const Key = mongoose.model('Key', KeySchema);

const BlacklistSchema = new mongoose.Schema({
  value: { type: String, required: true, unique: true }, // يمكن يكون key أو hwid
  type: { type: String, enum: ['key', 'hwid'], required: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Blacklist = mongoose.model('Blacklist', BlacklistSchema);

const ScriptSchema = new mongoose.Schema({
  scriptId: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});
const Script = mongoose.model('Script', ScriptSchema);

// ======================
// Middleware بسيط للحماية
// ======================
function checkAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'غير مسموح' });
  }
  next();
}

// ======================
// الصفحة الرئيسية
// ======================
app.get('/', (req, res) => {
  res.send('✅ API خدام مزيان - Luarmor Style');
});

// ======================
// 1. توليد كي
// ======================
app.post('/generate', checkAdmin, async (req, res) => {
  try {
    const scriptId = req.body.scriptId || 'main';
    const note = req.body.note || '';
    const newKey = 'KEY-' + Math.random().toString(36).substring(2, 12).toUpperCase();

    await Key.create({ key: newKey, scriptId, note });
    res.json({ success: true, key: newKey, scriptId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 2. اللودر (ستايل Luarmor) + HWID Lock
// ======================
app.get('/loader/:scriptId', async (req, res) => {
  const key = req.query.key;
  const hwid = req.query.hwid || req.headers['x-hwid'] || null;
  const scriptId = req.params.scriptId;

  if (!key) {
    return res.status(400).send('-- محتاج كي');
  }

  try {
    // تحقق من Blacklist
    const isBlacklisted = await Blacklist.findOne({
      $or: [
        { value: key, type: 'key' },
        { value: hwid, type: 'hwid' }
      ]
    });
    if (isBlacklisted) {
      return res.status(403).send('-- محظور');
    }

    const found = await Key.findOne({ key, scriptId });
    if (!found) {
      return res.status(403).send('-- كي غلط');
    }
    if (found.blacklisted) {
      return res.status(403).send('-- كي محظور');
    }

    // HWID Lock
    if (found.hwid === null && hwid) {
      // أول مرة → ربط الـ HWID
      found.hwid = hwid;
      found.lastUsed = new Date();
      await found.save();
    } else if (found.hwid && hwid && found.hwid !== hwid) {
      return res.status(403).send('-- HWID مختلف');
    } else {
      found.lastUsed = new Date();
      await found.save();
    }

    // جيب السكريبت
    const script = await Script.findOne({ scriptId });
    if (!script) {
      return res.type('text/plain').send(`
print("✅ تم التحقق من الكي بنجاح")
print("ماكاين حتى سكريبت مرفوع حالياً")
      `);
    }

    res.type('text/plain').send(script.code);
  } catch (err) {
    res.status(500).send('-- خطأ في السيرفر');
  }
});

// ======================
// 3. Reset HWID
// ======================
app.post('/reset-hwid', checkAdmin, async (req, res) => {
  try {
    const { key } = req.body;
    const found = await Key.findOne({ key });
    if (!found) return res.status(404).json({ error: 'الكي ماكاينش' });

    found.hwid = null;
    await found.save();
    res.json({ success: true, message: 'تم مسح الـ HWID' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 4. Blacklist Key
// ======================
app.post('/blacklist-key', checkAdmin, async (req, res) => {
  try {
    const { key, reason } = req.body;
    const found = await Key.findOne({ key });
    if (found) {
      found.blacklisted = true;
      await found.save();
    }
    await Blacklist.findOneAndUpdate(
      { value: key, type: 'key' },
      { value: key, type: 'key', reason: reason || '' },
      { upsert: true }
    );
    res.json({ success: true, message: 'تم حظر الكي' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 5. Blacklist HWID
// ======================
app.post('/blacklist-hwid', checkAdmin, async (req, res) => {
  try {
    const { hwid, reason } = req.body;
    await Blacklist.findOneAndUpdate(
      { value: hwid, type: 'hwid' },
      { value: hwid, type: 'hwid', reason: reason || '' },
      { upsert: true }
    );
    res.json({ success: true, message: 'تم حظر الـ HWID' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 6. Lookup Key
// ======================
app.get('/lookup/:key', checkAdmin, async (req, res) => {
  try {
    const found = await Key.findOne({ key: req.params.key });
    if (!found) return res.status(404).json({ error: 'الكي ماكاينش' });
    res.json(found);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 7. Delete Key
// ======================
app.delete('/delete-key', checkAdmin, async (req, res) => {
  try {
    const { key } = req.body;
    await Key.deleteOne({ key });
    res.json({ success: true, message: 'تم مسح الكي' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 8. رفع / تحديث سكريبت
// ======================
app.post('/script', checkAdmin, async (req, res) => {
  try {
    const { scriptId, code } = req.body;
    if (!scriptId || !code) {
      return res.status(400).json({ error: 'محتاج scriptId و code' });
    }
    await Script.findOneAndUpdate(
      { scriptId },
      { scriptId, code, updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ success: true, message: 'تم حفظ السكريبت' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// تشغيل السيرفر
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API خدام على البورت ${PORT}`);
});
