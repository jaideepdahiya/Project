import { asyncHandler } from "../utils/asyncHandler.js";
import {User} from "../models/user.model.js";
import {uploadFileOnCloudinary} from "../utils/cloudinary.js";
import {apiError} from "../utils/apiError.js";
import {apiResponse} from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";


const generateRefreshAndAccessToken = async(userID)=>{
    try {
        // TODO: try if we can directly pass the user instead of userID
        const user = await User.findById(userID);
        const refreshToken = user.generateRefreshToken();
        const accessToken = user.generateAccessToken();
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});
        return {accessToken, refreshToken};
    } catch (error) {
        throw new apiError(500, "Something went wrong while generating tokens. ")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    const {fullName, email, username, password} = req.body;
    if([fullName, email, username, password].some((field)=>field?.trim()==="")){
        throw new apiError(400, "All fields are required")
    }
    // TODO: put some more validation on the input
    const existedUser = await User.findOne({ $or: [{email}, {username}]});
    if(existedUser){
        throw new apiError(409, "username already in use")
    }
    // TODO: Check more about req.files
    // Avatar
    let avatarLocalPath;
    if (req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0) {
        avatarLocalPath = req.files.avatar[0].path;
    } else {
        throw new apiError(400, "Avatar image is required");
    }

    // Cover Image (optional)
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    const avatar = await uploadFileOnCloudinary(avatarLocalPath);
    const coverImage = await uploadFileOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new apiError(500, "Uploading failed to cloudinary");
    }

    const user = await User.create({
        fullName,
        email,
        username: username.toLowerCase(),
        password, 
        avatar : avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if(!createdUser){
        throw new apiError(500, "Something went wrong while creating user");
    }

    return res.status(201).json(
        new apiResponse(200, createdUser, "Created user successfully")
    )

})

const loginUser = asyncHandler(async (req, res) => {
    const {username, email, password} = req.body;
    if(!(username || email)) throw new apiError(400, "Username or Email is required");
    const user = await User.findOne({$or: [{email}, {username}]});
    if(!user) throw new apiError(404, "User doesn't exist");
    if(!(await user.isPasswordCorrect(password))) throw new apiError(401, "Username or Password incorrect");
    const {refreshToken, accessToken} = await generateRefreshAndAccessToken(user._id);
    // TODO: instead of querying again try to update the user itself
    // make sur that you don't return the password and refresh token
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    // Check about these options a little more
    // these stop the frontend to modify the cookies
    const options = {httpOnly: true, secure: true};
    return res
    .status(200)
    .cookie("accessToken",accessToken, options)
    .cookie("refreshToken",refreshToken, options)
    .json(
        new apiResponse(
            200, {
                user: loggedInUser, accessToken, refreshToken
                // sending tokens again even after setting in cookies
                // because user may also want to store them
                // not a good practice but needed sometimes
            },
            "User Logged in successfully"
        )
    )
    
})

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(req.user._id,{
        $set : {refreshToken: undefined}
    })
    const options ={
        httpOnly: true,
        secure: true
    }
    res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new apiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async(req, res) =>{
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken) throw new apiError(401, "Unauthorized request");
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);
        if(!user) throw new apiError(401, "invalid refresh token request");
        if(incomingRefreshToken !== user?.refreshToken) throw new apiError(401, "Refresh token is used or expired");
        const options = {httpOnly: true, secure: true};
        const {accessToken, newRefreshToken} = await generateRefreshAndAccessToken(user._id);
        res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(new apiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access Token refreshed"))
    } catch (error) {
        throw new apiError(500, error?.message || "Something went wrong while decoding token")
    }
})

export {registerUser, loginUser, logoutUser, refreshAccessToken};