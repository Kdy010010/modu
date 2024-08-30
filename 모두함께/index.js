const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');

const app = express();

// Ensure the required directories exist
const ensureDirectoryExistence = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureDirectoryExistence('public/uploads');
ensureDirectoryExistence(path.join(__dirname, 'data'));

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // 원본 파일명을 그대로 사용
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 파일 크기 제한 설정 (예: 10MB)
});

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// 데이터 저장을 위한 디렉토리
const dataDir = path.join(__dirname, 'data');

// JSON 파일에서 데이터 로드
const loadPosts = (board) => {
  const filePath = path.join(dataDir, `${board}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const data = fs.readFileSync(filePath);
  try {
    const posts = JSON.parse(data);
    return Array.isArray(posts) ? posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
  } catch (error) {
    return [];
  }
};

// JSON 파일에 데이터 저장
const savePosts = (board, posts) => {
  const filePath = path.join(dataDir, `${board}.json`);
  fs.writeFileSync(filePath, JSON.stringify(posts, null, 2));
};

// 메인 페이지
app.get('/', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading boards');
    }
    const boards = files.map(file => path.basename(file, '.json'));
    res.render('index', { boards });
  });
});

// 특정 게시판 페이지
app.get('/board/:board', (req, res) => {
  const board = req.params.board;
  const posts = loadPosts(board);
  res.render('board', { board, posts });
});

// 검색 결과 페이지
app.get('/board/:board/search', (req, res) => {
  const board = req.params.board;
  const query = req.query.q;
  const posts = loadPosts(board);
  const filteredPosts = posts.filter(post =>
    post.title.includes(query) || post.content.includes(query)
  );
  res.render('board', { board, posts: filteredPosts });
});

// 특정 게시물 페이지
app.get('/board/:board/post/:postId', (req, res) => {
  const board = req.params.board;
  const postId = parseInt(req.params.postId, 10);
  const posts = loadPosts(board);
  const post = posts.find(post => post.id === postId);
  res.render('post', { board, post });
});

// 새 글 작성 페이지
app.get('/board/:board/new', (req, res) => {
  const board = req.params.board;
  res.render('new', { board });
});

// 새 글 작성 처리
app.post('/board/:board/posts', upload.single('file'), (req, res) => {
  const board = req.params.board;
  let posts = loadPosts(board);

  if (!Array.isArray(posts)) {
    posts = [];
  }

  const sanitizedContent = sanitizeHtml(req.body.content, {
    allowedTags: [ 'b', 'i', 'em', 'strong', 'a', 'p', 'div', 'br', 'h1', 'h2', 'h3', 'ul', 'li', 'ol', 'img' ],
    allowedAttributes: {
      'a': [ 'href' ],
      'img': [ 'src', 'alt' ]
    }
  });

  const newPost = {
    id: Date.now(),
    title: req.body.title,
    content: sanitizedContent,
    file: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: new Date(),
    comments: [],
    likes: 0,
    dislikes: 0
  };

  posts.push(newPost);
  savePosts(board, posts);

  res.redirect(`/board/${board}`);
});

// 댓글 작성 처리
app.post('/board/:board/post/:postId/comment', (req, res) => {
  const board = req.params.board;
  const postId = parseInt(req.params.postId, 10);
  const replyToCommentIndex = req.body.replyToCommentIndex !== undefined ? parseInt(req.body.replyToCommentIndex, 10) : null;
  let posts = loadPosts(board);

  const post = posts.find(post => post.id === postId);
  if (post) {
    const newComment = {
      content: sanitizeHtml(req.body.content, {
        allowedTags: [ 'b', 'i', 'em', 'strong', 'a', 'p', 'div', 'br', 'h1', 'h2', 'h3', 'ul', 'li', 'ol', 'img' ],
        allowedAttributes: {
          'a': [ 'href' ],
          'img': [ 'src', 'alt' ]
        }
      }),
      createdAt: new Date(),
      replies: []
    };

    if (replyToCommentIndex !== null && post.comments[replyToCommentIndex]) {
      post.comments[replyToCommentIndex].replies.push(newComment);
    } else {
      post.comments.push(newComment);
    }
    
    savePosts(board, posts);
  }

  res.redirect(`/board/${board}/post/${postId}`);
});

// 좋아요/나빠요 처리
app.post('/board/:board/post/:postId/like', (req, res) => {
  const board = req.params.board;
  const postId = parseInt(req.params.postId, 10);
  let posts = loadPosts(board);

  const post = posts.find(post => post.id === postId);
  if (post) {
    post.likes += 1;
    savePosts(board, posts);
  }

  res.redirect(`/board/${board}`);
});

app.post('/board/:board/post/:postId/dislike', (req, res) => {
  const board = req.params.board;
  const postId = parseInt(req.params.postId, 10);
  let posts = loadPosts(board);

  const post = posts.find(post => post.id === postId);
  if (post) {
    post.dislikes += 1;
    savePosts(board, posts);
  }

  res.redirect(`/board/${board}`);
});

// 새 게시판 작성 페이지
app.get('/newboard', (req, res) => {
  res.render('newboard');
});

// 새 게시판 작성 처리
app.post('/newboard', (req, res) => {
  const board = req.body.boardName;
  const filePath = path.join(dataDir, `${board}.json`);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]');  // 빈 배열로 초기화된 파일 생성
  }

  res.redirect(`/board/${board}`);
});

// 규칙 페이지
app.get('/rules', (req, res) => {
  res.render('rules');
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
