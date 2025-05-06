import { Router } from "express"
import { getVideoComments, addComment, deleteComment, updateComment } from "../controllers/comment.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"

const router = Router()

router.use(verifyJWT)

router.route("/:videoId").get(getVideoComments).post(addComment)
router.route("/c/:commentId").delete(deleteComment).patch(updateComment)