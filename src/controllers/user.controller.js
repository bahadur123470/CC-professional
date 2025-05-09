import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken" 
import mongoose from "mongoose";


const generateTokens = async(userID) =>{
    try{
        const user = await User.findById(userID)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}
    }
    catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler ( async (req,res) => {
    if (!req.body) {
        console.error("Request body is undefined");
        throw new ApiError(400, "Request body is missing");
    }
    console.log("Request body:", req.body);
    console.log("Request files:", req.files);

    // get user details fro frontend
    const { fullName, username, email, password} = req.body
    console.log("email: ", email)
    // console.log(req.body)
    
    
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
        
        // console.log(req.files)
        // check for images , check for avatar
        const avatarLocalPath = req.files?.avatar[0]?.path;
        const coverImageLocalPath = req.files?.coverImage[0]?.path;
        // let coverImageLocalPath ;
        // if (req.files && Array.isArray (req.files.coverImage) && req.files.coverImage.length > 0 ){
        //     coverImageLocalPath = req.files.coverImage[0].path
        // }
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

const loginUser = asyncHandler ( async (req, res ) => {
    const { username, email, password } = req.body 
    console.log(email)
    
    //  check usernames and password
    if (!username && !password){
        throw new ApiError(400, "Username and password are required")
    }
    // check if user exist
    const user = await User.findOne({
        $or: [{ username}, { email}]
    }).select("+password")
    if (!user){
        throw new ApiError(404, "User not found")
    }
    // check if password is correct
    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid){
        throw new ApiError(401, "Invalid password")
    }
    //  generate access and refresh token
    const { accessToken, refreshToken} = await generateTokens(user._id)

    // remove password and refreshToken field from response
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    const options = {
        httpOnly: true,
        secure: true,
    }
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "User logged in successfully" 
            )
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true,
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        )
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken
    if (!incomingRefreshToken){
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
        if (incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "refresh token is expired or used")
        }
        const options = {
            httpOnly: true,
            secure: true,
        }
        const { accessToken, newRefreshToken } = await generateTokens(user._id)
    
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken, refreshToken: newRefreshToken
                    },
                    "Access token refreshed successfully"
                )
            )
    }
    catch (error){
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body
    
    const user = await User.findById(req.user._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect){
        throw new ApiError(401, "Invalid old password")
    }
    user.password = newPassword
    await user.save({ validateBeforeSave: false})

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Password changed successfully")
        )
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "Current user fetched successfully")
        )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    // if (!req.body) {
    //     console.error("Request body is undefined");
    //     throw new ApiError(400, "Request body is missing");
    // }
    // console.log("Request body:", req.body);

    const { fullName, username, email} = req.body

    if (!fullName || !username || !email){
        throw new ApiError(400, "All fields are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                username: username.toLowerCase(),
                email
            }
        },
        { new: true}  
    ).select("-password")

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully")
        )
})

const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }
    // TODO 
    // // delete old avatar from cloudinary
    // const oldAvatar = req.user?.avatar
    // if (oldAvatar){
    //     const publicId = oldAvatar.split("/").pop().split(".")[0]
    //     await deleteOnCloudinary(publicId)
    // }
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar.url){
        throw new ApiError(400, " Error while uploading avatar")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true}
    ).select("-password")
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Avatar updated successfully")
        )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    if (!coverImageLocalPath){
        throw new ApiError(400, "Cover image is required")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!coverImage.url){
        throw new ApiError(400, " Error while uploading cover image")
    }
    const user =  await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true} 
    ).select("-password")
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Cover image updated successfully")
        )
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params
    
    if (!username?.trim){
        throw new ApiError(400, "Username is required")
    }

const channel = await User.aggregate([
    {
        $match: {
            username: username?.toLowerCase()
        }
    },
    {
        $lookup: {
            from: "subscriptions",
            localField: "_id" ,
            foreignField: "channel",
            as: "subscribers"
        }
    },
    {
        $lookup: {
            from: "subscriptions",
            localField: "_id",
            foreignField: "subscriber",
            as: "subscribedTo"
        }
    },
    {
        $addFields: {
            subscriberCount:{
                $size: "$subscribers"
            },
            channelsSubscribedToCount: {
                $size: "$subscribedTo"
            },
            isSubscribed: {
                $cond: {
                    if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                    then: true,
                    else: false
                }
            }
        }
    },
    {
        $project: {
            fullName: 1,
            username: 1,
            avatar: 1,
            coverImage: 1,
            subscriberCount: 1,
            channelsSubscribedToCount: 1,
            isSubscribed: 1,
            email: 1,
        }
    }
])

if (!channel?.length){
    throw new ApiError(404, "Channel does not exist")
}
return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "Channel profile fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(200, user[0]?.watchHistory, "Watch history fetched successfully")
        )
})


export { 
    registerUser,
    loginUser, 
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage, 
    getUserChannelProfile,
    getWatchHistory
}