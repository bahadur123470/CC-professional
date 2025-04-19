import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler ( async (req,res) => {
    
    // get user details fro frontend
    const { fullName, username, email, password} = req.body
    console.log("email: ", email)
    
    
    // validation ( not empty)
    
    // // beginner friendly method
    // if (fullName === ""){
        //     throw new ApiError (400, "Fullname is required")
        // }
        if (
            [fullName, username, email, password].some((field) => field?.trim() === "" )
        ) {
            throw new ApiError(400, "All fields are required")
        }
        
        
        // check if user already exist: username, email
        const existedUser = await User.findOne({
            $or: [{ username },{ email }]
        })
        if (existedUser ){
            throw new ApiError(409, "User with this Username or Email already exist")
        }
        
        
        // check for images , check for avatar
        const avatarLocalPath = req.files?.avatar[0]?.path;
        const coverImageLocalPath = req.files?.coverImage[0]?.path;
        if (!avatarLocalPath) {
            throw new ApiError(400, "Avatar is required")
        }
        
        
        // upload them to cloudinary, avatar ( check avatar again imp )
        const avatar = await uploadOnCloudinary(avatarLocalPath)
        const coverImage = await uploadOnCloudinary(coverImageLocalPath)
        if (!avatar ){
            throw new ApiError(400, " Avatar file is required ")
        }
        
        
        // create user object - create entry in db
        const user = await User.create({
            fullName,
            username: username.toLowerCase(),
            avatar: avatar.url,
            coverImage: coverImage?.url || "" ,
            email,
            password,
        })


        // remove password and refreshToken field from response
        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken"

            
            // check for user creation
        )
        if (!createdUser){
            throw new ApiError(500, " Failed to create user")
        }
        

        // return response
        return res.status(201).json(
            new ApiResponse(200, createdUser , " User created successfully")
        )


})

export { registerUser }